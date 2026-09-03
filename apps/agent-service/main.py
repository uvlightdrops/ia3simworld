import sys
import os
import random
import json
from concurrent import futures
import grpc
import mesa

# Add current folder to path for gRPC imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sim.v1 import sim_pb2
from sim.v1 import sim_pb2_grpc


import time
import urllib.request
import urllib.error

def query_ollama(prompt, system_prompt="", base_url="http://localhost:11434", model="llama3.2:latest", timeout_ms=8000):
    """
    Queries local Ollama HTTP endpoint synchronously with strict timeout & rule-based fallback.
    """
    if not base_url or not model:
        return None
    url = f"{base_url.rstrip('/')}/api/generate"
    payload = {
        "model": model,
        "prompt": prompt,
        "system": system_prompt,
        "stream": False,
        "options": {
            "temperature": 0.7,
            "num_predict": 120
        }
    }
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'}, method='POST')
    try:
        timeout_sec = max(1.0, float(timeout_ms) / 1000.0)
        with urllib.request.urlopen(req, timeout=timeout_sec) as response:
            if response.status == 200:
                res_body = json.loads(response.read().decode('utf-8'))
                res_text = res_body.get('response', '').strip()
                return res_text if res_text else None
    except Exception as e:
        print(f"[Ollama GameMaster KI Error / Rule Fallback]: {e}")
    return None

# AI Game Managers state for Social Threefolding (Soziale Dreigliederung)
class GameManagerState:
    def __init__(self):
        self.last_relic_tick = 0
        self.last_law_tick = 0
        self.last_econ_tick = 0
        self.proposed_law = ""
        self.active_laws = []
        self.manager_a_thoughts = []
        self.manager_b_thoughts = []
        self.manager_c_thoughts = []

    def add_thought_a(self, text):
        self.manager_a_thoughts.insert(0, f"[{time.strftime('%H:%M:%S')}] {text}")
        if len(self.manager_a_thoughts) > 20:
            self.manager_a_thoughts = self.manager_a_thoughts[:20]

    def add_thought_b(self, text):
        self.manager_b_thoughts.insert(0, f"[{time.strftime('%H:%M:%S')}] {text}")
        if len(self.manager_b_thoughts) > 20:
            self.manager_b_thoughts = self.manager_b_thoughts[:20]

    def add_thought_c(self, text):
        self.manager_c_thoughts.insert(0, f"[{time.strftime('%H:%M:%S')}] {text}")
        if len(self.manager_c_thoughts) > 20:
            self.manager_c_thoughts = self.manager_c_thoughts[:20]

state_tracker = GameManagerState()

def prepend_unique_thought(thoughts, text):
    if thoughts and thoughts[0].endswith(text):
        return
    thoughts.insert(0, f"[{time.strftime('%H:%M:%S')}] {text}")
    if len(thoughts) > 20:
        del thoughts[20:]


class MesaSimAgent(mesa.Agent):
    def __init__(self, unique_id, model, agent_data):
        super().__init__(model)
        self.unique_id = unique_id
        self.agent_id = agent_data.id
        self.name = agent_data.name
        self.role = agent_data.role
        self.mood = agent_data.mood
        self.status = agent_data.status
        self.energy = agent_data.energy
        self.resources = agent_data.resources
        self.waste = agent_data.waste
        self.position = (agent_data.position.x, agent_data.position.y)
        self.target = (agent_data.target.x, agent_data.target.y)
        self.interests = [(i.name, i.intensity) for i in agent_data.interests]
        self.agreement = agent_data.agreement if agent_data.HasField("agreement") else None

    def select_scout_target(self):
        candidates = []
        for pos, tile in self.model.terrain_map.items():
            if tile.terrain_type in ["forest", "water"]:
                candidates.append(pos)
        if not candidates:
            return self.model.get_random_walkable_tile()
        candidates.sort(key=lambda p: self.model.toroidal_distance(self.position, p))
        agent_num = int(self.agent_id.split("-")[-1]) if "-" in self.agent_id else 0
        far_candidates = [p for p in candidates if 15 < self.model.toroidal_distance(self.position, p) < 50]
        if far_candidates:
            idx = (agent_num + int(self.model.tick // 20)) % len(far_candidates)
            return far_candidates[idx]
        return candidates[agent_num % len(candidates)]

    def select_builder_target(self):
        candidates = []
        for pos, tile in self.model.terrain_map.items():
            if tile.terrain_type in ["home", "road"]:
                candidates.append(pos)
        if not candidates:
            return self.model.get_random_walkable_tile()
        candidates.sort(key=lambda p: self.model.toroidal_distance(self.position, p))
        agent_num = int(self.agent_id.split("-")[-1]) if "-" in self.agent_id else 0
        far_candidates = [p for p in candidates if self.model.toroidal_distance(self.position, p) > 10]
        if far_candidates:
            idx = (agent_num + int(self.model.tick // 15)) % len(far_candidates)
            return far_candidates[idx]
        return candidates[agent_num % len(candidates)]

    def select_researcher_target(self):
        candidates = []
        for pos, tile in self.model.terrain_map.items():
            if tile.terrain_type == "home":
                candidates.append(pos)
        if not candidates:
            return self.model.get_random_walkable_tile()
        agent_num = int(self.agent_id.split("-")[-1]) if "-" in self.agent_id else 0
        current_tile = self.model.terrain_map.get(self.position)
        if current_tile and current_tile.terrain_type == "home":
            if "studying at homestead" in self.status:
                try:
                    parts = self.status.split("(")[1].split(")")[0].split("/")
                    count = int(parts[0])
                    total = int(parts[1])
                    if count < total:
                        self.status = f"studying at homestead ({count + 1}/{total})"
                        return self.position
                except Exception:
                    pass
            else:
                self.status = "studying at homestead (1/5)"
                return self.position
        far_candidates = [p for p in candidates if self.model.toroidal_distance(self.position, p) > 10]
        if far_candidates:
            idx = (agent_num + int(self.model.tick // 10)) % len(far_candidates)
            return far_candidates[idx]
        return candidates[agent_num % len(candidates)]

    def select_tracker_target(self):
        w, h = self.model.width, self.model.height
        waypoints = [
            (5, 5),
            (w - 6, 5),
            (w - 6, h - 6),
            (5, h - 6)
        ]
        if self.position in waypoints:
            idx = waypoints.index(self.position)
            next_idx = (idx + 1) % len(waypoints)
            return waypoints[next_idx]
        waypoints.sort(key=lambda p: self.model.toroidal_distance(self.position, p))
        return waypoints[0]

    def step(self):
        # 1. Determine local neighbors and resource tiles
        adjacent_positions = self.model.grid.get_neighborhood(self.position, moore=False, include_center=True)
        
        is_next_to_water_or_forest_or_crops = False
        is_next_to_rock = False
        is_next_to_home = False
        is_next_to_market = False
        is_next_to_court = False
        is_next_to_temple = False
        
        adjacent_tiles = []
        for pos in adjacent_positions:
            tile = self.model.terrain_map.get(pos)
            if tile:
                adjacent_tiles.append(tile)
                if tile.terrain_type in ["water", "forest", "crops", "farm"]:
                    is_next_to_water_or_forest_or_crops = True
                if tile.terrain_type == "rock":
                    is_next_to_rock = True
                if tile.terrain_type in ["home", "farm"]:
                    is_next_to_home = True
                if tile.terrain_type == "market":
                    is_next_to_market = True
                if tile.terrain_type == "court":
                    is_next_to_court = True
                if tile.terrain_type in ["temple", "graveyard"]:
                    is_next_to_temple = True

        current_tile = self.model.terrain_map.get(self.position)
        if current_tile:
            if current_tile.terrain_type in ["home", "farm"]:
                is_next_to_home = True
            if current_tile.terrain_type == "market":
                is_next_to_market = True
            if current_tile.terrain_type == "court":
                is_next_to_court = True
            if current_tile.terrain_type in ["temple", "graveyard"]:
                is_next_to_temple = True

        # 2. Run prioritized behavioral decision tree within Mesa
        
        # Priority 1: Sleep Emergency
        if self.energy < 25:
            if is_next_to_home:
                self.energy = 100
                self.status = "sleeping at homestead"
                self.mood = "satisfied"
            else:
                self.status = "seeking shelter"
                self.mood = "tired"
                self.target = self.model.find_nearest_resource(self.position, ["home"])
                
        # Priority 2: Starvation Emergency
        elif self.resources < 25:
            if is_next_to_water_or_forest_or_crops:
                consumed = False
                for t in adjacent_tiles:
                    if t.terrain_type == "water":
                        self.resources = 100
                        self.status = "replenished (water)"
                        self.mood = "satisfied"
                        consumed = True
                        break
                    elif t.terrain_type == "forest" and t.object_amount > 10:
                        self.resources = 100
                        self.status = "replenished (berries)"
                        self.mood = "satisfied"
                        consumed = True
                        break
                    elif t.terrain_type == "crops" and t.object_amount > 10:
                        self.resources = 100
                        self.status = "replenished (crops)"
                        self.mood = "satisfied"
                        consumed = True
                        break
                if not consumed:
                    self.status = "seeking resources"
                    self.mood = "stressed"
                    self.target = self.model.find_nearest_resource(self.position, ["water", "forest", "crops"])
            else:
                self.status = "seeking resources"
                self.mood = "stressed"
                self.target = self.model.find_nearest_resource(self.position, ["water", "forest", "crops"])

        # Priority 3: Waste disposal Emergency
        elif self.waste > 75:
            if is_next_to_rock:
                self.waste = 0
                self.status = "dumped waste"
                self.mood = "satisfied"
            else:
                self.status = "seeking waste dump"
                self.mood = "disgusted"
                self.target = self.model.find_nearest_resource(self.position, ["rock"])

        # Priority 4: Daytime-Dependent Routines (Schritt 3)
        else:
            hour = self.model.tick % 24
            
            # Night (0-5)
            if 0 <= hour <= 5:
                if is_next_to_home:
                    self.energy = 100
                    self.status = "sleeping at homestead"
                    self.mood = "satisfied"
                else:
                    self.status = "traveling home to sleep"
                    self.mood = "tired"
                    self.target = self.model.find_nearest_resource(self.position, ["home"])
            
            # Morning (6-11)
            elif 6 <= hour <= 11:
                if is_next_to_market:
                    self.status = "trading at marketplace"
                    self.mood = "social"
                else:
                    self.status = "heading to marketplace"
                    self.mood = "social"
                    self.target = self.model.find_nearest_resource(self.position, ["market"])
            
            # Evening (18-23)
            elif 18 <= hour <= 23:
                if is_next_to_temple:
                    self.status = "meditating at temple"
                    self.mood = "spiritual"
                elif is_next_to_court:
                    self.status = "attending tribunal"
                    self.mood = "reflective"
                else:
                    self.status = "heading to court"
                    self.mood = "reflective"
                    self.target = self.model.find_nearest_resource(self.position, ["court", "temple"])
            
            # Afternoon / Free / Work Patrolling time (12-17)
            else:
                if self.agreement:
                    self.status = f"cooperating ({self.agreement.type})"
                    self.mood = "focused"
                    self.target = (self.agreement.target_x, self.agreement.target_y)
                else:
                    self.mood = "focused"
                    
                    # Timber logging behavior if forest_policy allows it
                    is_next_to_forest = False
                    for pos in adjacent_positions:
                        tile = self.model.terrain_map.get(pos)
                        if tile and tile.terrain_type == "forest":
                            is_next_to_forest = True
                            break
                    
                    if is_next_to_forest and self.model.forest_policy == "timber" and (self.role == "Builder" or self.role == "Scout") and random.random() < 0.4:
                        self.status = "harvesting timber at forest"
                        self.target = self.position
                    elif self.status == "planting crops" and self.position == self.target:
                        self.status = "cultivating crops (1/3)"
                        self.target = self.position
                    elif self.status == "cultivating crops (1/3)":
                        self.status = "cultivating crops (2/3)"
                        self.target = self.position
                    elif self.status == "cultivating crops (2/3)":
                        self.status = "cultivating crops (3/3)"
                        self.target = self.position
                    elif self.status == "cultivating crops (3/3)":
                        self.status = "maintaining infrastructure"
                        self.target = self.select_builder_target()
                    elif self.status == "planting crops":
                        # still moving to planting spot
                        pass
                    elif self.position == self.target or self.target == (0, 0) or "patrolling" in self.status or self.status in ["seeking shelter", "traveling home to sleep", "heading to marketplace", "heading to court", "sleeping at homestead", "trading at marketplace", "attending tribunal"]:
                        if self.role == "Scout":
                            self.target = self.select_scout_target()
                            if self.position != self.target:
                                self.status = "scouting resources"
                            else:
                                self.status = "inspecting resource"
                        elif self.role == "Builder":
                            # Check if we should plant crops
                            crop_tiles = [pos for pos, tile in self.model.terrain_map.items() if tile.terrain_type == "crops"]
                            grass_near_homes = []
                            if self.model.grass_policy == "agriculture" and len(crop_tiles) < 15 and self.resources > 40 and self.energy > 40:
                                # Find grass tiles that are close (within 3 steps) to any home tile
                                homes = [pos for pos, tile in self.model.terrain_map.items() if tile.terrain_type == "home"]
                                for g_pos, g_tile in self.model.terrain_map.items():
                                    if g_tile.terrain_type == "grass":
                                        for h_pos in homes:
                                            if self.model.toroidal_distance(g_pos, h_pos) <= 3:
                                                grass_near_homes.append(g_pos)
                                                break
                            if grass_near_homes:
                                # Pick the nearest grass tile to plant crops!
                                grass_near_homes.sort(key=lambda p: self.model.toroidal_distance(self.position, p))
                                self.target = grass_near_homes[0]
                                self.status = "planting crops"
                                self.mood = "focused"
                            else:
                                self.target = self.select_builder_target()
                                if self.position != self.target:
                                    if self.model.grass_policy == "protected":
                                        self.status = "patrolling road (crops protected)"
                                    else:
                                        self.status = "patrolling road network"
                                else:
                                    self.status = "maintaining infrastructure"
                        elif self.role == "Researcher":
                            self.target = self.select_researcher_target()
                            if "studying at homestead" not in self.status:
                                self.status = "traveling to homestead"
                        elif self.role == "Tracker":
                            self.target = self.select_tracker_target()
                            self.status = "securing perimeter"
                        else:
                            self.target = self.model.get_random_walkable_tile()
                            self.status = "patrolling"
                    elif "studying at homestead" in self.status and self.role == "Researcher":
                        self.target = self.select_researcher_target()


class MesaSimModel(mesa.Model):
    def __init__(self, request):
        super().__init__()
        self.tick = request.tick
        self.width = request.world_width
        self.height = request.world_height
        self.grass_policy = request.grass_policy or "agriculture"
        self.forest_policy = request.forest_policy or "berries"
        self.grid = mesa.space.MultiGrid(self.width, self.height, torus=True)
        
        # Parse terrain and build cache
        self.terrain_map = {}
        self.walkable_tiles = []
        for tile in request.terrain_tiles:
            pos = (tile.x, tile.y)
            self.terrain_map[pos] = tile
            if tile.terrain_type not in ["water", "rock"]:
                self.walkable_tiles.append(pos)

        # Add agents
        self.mesa_agents = []
        for agent_data in request.agents:
            agent = MesaSimAgent(agent_data.id, self, agent_data)
            self.grid.place_agent(agent, agent.position)
            self.mesa_agents.append(agent)

    def step(self):
        # In Mesa, model.step usually triggers all agents to step
        # Since we want deterministic execution, we iterate and call step
        for agent in self.mesa_agents:
            agent.step()

    def find_nearest_resource(self, start_pos, terrain_types):
        min_dist = 999999
        best_pos = start_pos
        for pos, tile in self.terrain_map.items():
            if tile.terrain_type in terrain_types:
                neighbors = self.grid.get_neighborhood(pos, moore=True, include_center=True)
                for n_pos in neighbors:
                    n_tile = self.terrain_map.get(n_pos)
                    t_type = n_tile.terrain_type if n_tile else "grass"
                    if t_type not in ["water", "rock"]:
                        dist = self.toroidal_distance(start_pos, n_pos)
                        if dist < min_dist and dist > 0:
                            min_dist = dist
                            best_pos = n_pos
        if best_pos == start_pos:
            return self.get_random_walkable_tile()
        return best_pos

    def toroidal_distance(self, p1, p2):
        dx = abs(p1[0] - p2[0])
        dy = abs(p1[1] - p2[1])
        if dx > self.width / 2.0:
            dx = self.width - dx
        if dy > self.height / 2.0:
            dy = self.height - dy
        return dx + dy

    def get_random_walkable_tile(self):
        for _ in range(50):
            rx = random.randint(0, self.width - 1)
            ry = random.randint(0, self.height - 1)
            tile = self.terrain_map.get((rx, ry))
            t_type = tile.terrain_type if tile else "grass"
            if t_type not in ["water", "rock"]:
                return (rx, ry)
        return (self.width // 2, self.height // 2)


class AgentDecisionServicer(sim_pb2_grpc.AgentDecisionServiceServicer):
    def DecideActions(self, request, context):
        # 1. Determine current policies
        grass_policy = request.grass_policy or "agriculture"
        forest_policy = request.forest_policy or "berries"
        
        # 2. Check if a weekly negotiation happens at the Court (every 120 ticks)
        if request.tick > 0 and request.tick % 120 == 0:
            # Gather statistics for negotiation
            total_agents = len(request.agents)
            avg_resources = sum(a.resources for a in request.agents) / total_agents if total_agents > 0 else 100
            crop_fields_count = sum(1 for tile in request.terrain_tiles if tile.terrain_type == "crops")
            
            # Negotiate policies based on collective survival and resource metrics
            if avg_resources < 55 or crop_fields_count < 8:
                # Emergency: Food or crops are scarce! Prioritize farming and berry gathering.
                grass_policy = "agriculture"
                forest_policy = "berries"
                print(f"[Court] Negotiation at tick {request.tick}: Hunger/Scarcity detected (avg_resources={avg_resources:.1f}, crop_fields={crop_fields_count}). Decided: Grassland -> Agriculture 🌾, Forest -> Berries 🍓")
            else:
                # Abundance: Food is stable, let nature rest and harvest timber instead.
                grass_policy = "protected"
                forest_policy = "timber"
                print(f"[Court] Negotiation at tick {request.tick}: Abundance detected (avg_resources={avg_resources:.1f}, crop_fields={crop_fields_count}). Decided: Grassland -> Protected 🚫🌾, Forest -> Timber Harvesting 🪓")

            # Override the model's policy for this tick so agents immediately conform
            request.grass_policy = grass_policy
            request.forest_policy = forest_policy

        # 3. AI Game Managers Logic for Social Threefolding (Soziale Dreigliederung)
        map_updates = []
        injected_events = []
        current_tick = request.tick

        # Fetch rates & Ollama settings from request, fallback to defaults if not set
        relic_spawn_rate = request.relic_spawn_rate if request.relic_spawn_rate > 0 else 80
        law_propose_rate = request.law_propose_rate if request.law_propose_rate > 0 else 140
        econ_event_rate = request.econ_event_rate if request.econ_event_rate > 0 else 100
        artifact_quality = request.artifact_quality if request.artifact_quality > 0 else 100
        quality_factor = artifact_quality / 100.0

        ollama_enabled = getattr(request, 'ollama_enabled', True)
        ollama_base_url = getattr(request, 'ollama_base_url', '') or os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434')
        ollama_model = getattr(request, 'ollama_model', '') or os.getenv('OLLAMA_MODEL', 'llama3.2:latest')
        ollama_mode = getattr(request, 'ollama_mode', '') or os.getenv('OLLAMA_MODE', 'thoughts_only')
        ollama_timeout_ms = getattr(request, 'ollama_timeout_ms', 0) or int(os.getenv('OLLAMA_TIMEOUT_MS', '8000'))

        # --- MANAGER A: Geistesleben (Culture & Spirit) ---
        ticks_relic = current_tick - state_tracker.last_relic_tick
        
        # Ollama Reasoning Thought Generation for Manager A
        if ollama_enabled and ollama_mode != "disabled" and current_tick % 15 == 0:
            sys_a = "Du bist der Geistesleben-GameMaster (Geist, Kultur, Kunst) der Simulation IA3 SimWorld."
            prompt_a = f"Tick #{current_tick}. Reliktrate: {ticks_relic}/{relic_spawn_rate}. Schreibe 1 kurzen Satz auf Deutsch über deinen geistigen Impuls."
            ollama_thought_a = query_ollama(prompt_a, sys_a, ollama_base_url, ollama_model, ollama_timeout_ms)
            if ollama_thought_a:
                state_tracker.add_thought_a(f"🤖 [Ollama/{ollama_model}] {ollama_thought_a}")
            else:
                prepend_unique_thought(
                    state_tracker.manager_a_thoughts,
                    f"Scanning world for spiritual needs. Ticks since last relic: {ticks_relic}/{relic_spawn_rate}. Quality: {artifact_quality}%.",
                )
        else:
            prepend_unique_thought(
                state_tracker.manager_a_thoughts,
                f"Scanning world for spiritual needs. Ticks since last relic: {ticks_relic}/{relic_spawn_rate}. Quality: {artifact_quality}%.",
            )

        if current_tick > 0 and (current_tick == 10 or (ticks_relic >= relic_spawn_rate)):
            state_tracker.last_relic_tick = current_tick
            grass_tiles = [t for t in request.terrain_tiles if t.terrain_type == "grass" and t.object_type == ""]
            if grass_tiles:
                target_tile = random.choice(grass_tiles)
                relic_amount = int(100 * quality_factor)
                map_updates.append(sim_pb2.MapUpdate(
                    x=target_tile.x,
                    y=target_tile.y,
                    terrain_type="grass",
                    object_type="spiritual_symbol",
                    object_amount=relic_amount
                ))
                msg = f"✨ KI Geistesleben: An ancient relic of wisdom was revealed at ({target_tile.x}, {target_tile.y})! Deep interest in Arts & Philosophy is spreading. (Quality: {relic_amount}%) 📖"
                injected_events.append(msg)
                state_tracker.add_thought_a(f"Spawning relic of wisdom at ({target_tile.x}, {target_tile.y}) with amount {relic_amount} based on quality {artifact_quality}%.")

        # --- MANAGER B: Rechtssphäre (Laws & Rights) ---
        ticks_law = current_tick - state_tracker.last_law_tick
        
        # Ollama Reasoning Thought Generation for Manager B
        if ollama_enabled and ollama_mode != "disabled" and current_tick % 15 == 0:
            sys_b = "Du bist der Rechtssphäre-GameMaster (Tribunal, Rechte & Gesetze) der Simulation IA3 SimWorld."
            prompt_b = f"Tick #{current_tick}. Aktive Gesetze: {state_tracker.active_laws}. Nächste Abstimmung in {law_propose_rate - ticks_law} Ticks. Schreibe 1 kurzen Satz auf Deutsch zur Rechtslage."
            ollama_thought_b = query_ollama(prompt_b, sys_b, ollama_base_url, ollama_model, ollama_timeout_ms)
            if ollama_thought_b:
                state_tracker.add_thought_b(f"🤖 [Ollama/{ollama_model}] {ollama_thought_b}")
            else:
                prepend_unique_thought(
                    state_tracker.manager_b_thoughts,
                    f"Evaluating tribunal legislative schedule. Ticks since last law: {ticks_law}/{law_propose_rate}. Active laws count: {len(state_tracker.active_laws)}.",
                )
        else:
            prepend_unique_thought(
                state_tracker.manager_b_thoughts,
                f"Evaluating tribunal legislative schedule. Ticks since last law: {ticks_law}/{law_propose_rate}. Active laws count: {len(state_tracker.active_laws)}.",
            )

        if current_tick > 0 and (ticks_law >= law_propose_rate):
            state_tracker.last_law_tick = current_tick
            bills = [
                "Equitable Resource Sharing Act",
                "Eco-Conservation Bill",
                "Builder Subsidy Act"
            ]
            
            chosen_bill = None
            if ollama_enabled and ollama_mode == "full_decisions":
                sys_b_dec = "Du bist der Rechtssphäre-GameMaster. Wähle exakt eines dieser Gesetze: 'Equitable Resource Sharing Act', 'Eco-Conservation Bill', 'Builder Subsidy Act'."
                prompt_b_dec = "Antworte NUR mit dem exakten Gesetzesnamen ohne Erklärung."
                llm_bill = query_ollama(prompt_b_dec, sys_b_dec, ollama_base_url, ollama_model, ollama_timeout_ms)
                if llm_bill:
                    for b in bills:
                        if b.lower() in llm_bill.lower():
                            chosen_bill = b
                            break
            
            state_tracker.proposed_law = chosen_bill if chosen_bill else random.choice(bills)
            msg = f"⚖️ KI Rechtssphäre: Proposed the '{state_tracker.proposed_law}' at the courtroom tribunal! Voting will occur this evening."
            injected_events.append(msg)
            state_tracker.add_thought_b(f"Proposed law '{state_tracker.proposed_law}' to balance social spheres of AI agents.")

        # Voting resolves during evening hour 23
        hour = current_tick % 24
        if state_tracker.proposed_law and hour == 23:
            yes_votes = 0
            no_votes = 0
            for agent in request.agents:
                if state_tracker.proposed_law == "Builder Subsidy Act" and agent.role == "Builder":
                    yes_votes += 1
                elif state_tracker.proposed_law == "Eco-Conservation Bill" and agent.mood == "satisfied":
                    yes_votes += 1
                elif state_tracker.proposed_law == "Equitable Resource Sharing Act" and agent.energy < 50:
                    yes_votes += 1
                else:
                    if random.random() < 0.45:
                        yes_votes += 1
                    else:
                        no_votes += 1
            
            if yes_votes >= no_votes:
                state_tracker.active_laws.append(state_tracker.proposed_law)
                msg = f"⚖️ KI Rechtssphäre: Law PASSED! '{state_tracker.proposed_law}' is now active (Yes: {yes_votes}, No: {no_votes})! 📜"
                injected_events.append(msg)
                state_tracker.add_thought_b(f"Tribunal vote resolved for '{state_tracker.proposed_law}': PASSED (Yes: {yes_votes}, No: {no_votes}).")
            else:
                msg = f"⚖️ KI Rechtssphäre: Law REJECTED (Yes: {yes_votes}, No: {no_votes})."
                injected_events.append(msg)
                state_tracker.add_thought_b(f"Tribunal vote resolved for '{state_tracker.proposed_law}': REJECTED (Yes: {yes_votes}, No: {no_votes}).")
            state_tracker.proposed_law = ""

        # --- MANAGER C: Wirtschaftsleben (Economic Life & Physical Challenges) ---
        ticks_econ = current_tick - state_tracker.last_econ_tick
        
        # Ollama Reasoning Thought Generation for Manager C
        if ollama_enabled and ollama_mode != "disabled" and current_tick % 15 == 0:
            sys_c = "Du bist der Wirtschaftsleben-GameMaster (Wirtschaft, Natur & Ressourcen) der Simulation IA3 SimWorld."
            prompt_c = f"Tick #{current_tick}. Event in {econ_event_rate - ticks_econ} Ticks. Schreibe 1 kurzen Satz auf Deutsch zur wirtschaftlichen Lage."
            ollama_thought_c = query_ollama(prompt_c, sys_c, ollama_base_url, ollama_model, ollama_timeout_ms)
            if ollama_thought_c:
                state_tracker.add_thought_c(f"🤖 [Ollama/{ollama_model}] {ollama_thought_c}")
            else:
                prepend_unique_thought(
                    state_tracker.manager_c_thoughts,
                    f"Monitoring resource storage and farming conditions. Ticks since last event: {ticks_econ}/{econ_event_rate}.",
                )
        else:
            prepend_unique_thought(
                state_tracker.manager_c_thoughts,
                f"Monitoring resource storage and farming conditions. Ticks since last event: {ticks_econ}/{econ_event_rate}.",
            )

        if current_tick > 0 and (ticks_econ >= econ_event_rate):
            state_tracker.last_econ_tick = current_tick
            
            econ_event = None
            if ollama_enabled and ollama_mode == "full_decisions":
                sys_c_dec = "Du bist der Wirtschaftsleben-GameMaster. Wähle ein Umwelt/Wirtschaftsevent: 'drought', 'swarm' oder 'harvest'."
                prompt_c_dec = "Antworte NUR mit dem Wort drought, swarm oder harvest."
                llm_event = query_ollama(prompt_c_dec, sys_c_dec, ollama_base_url, ollama_model, ollama_timeout_ms)
                if llm_event:
                    for ev in ["drought", "swarm", "harvest"]:
                        if ev in llm_event.lower():
                            econ_event = ev
                            break
            
            if not econ_event:
                econ_event = random.choice(["drought", "swarm", "harvest"])

            if econ_event == "drought":
                injected_events.append("🌾 KI Wirtschaftsleben: Drought! Lake waters are temporarily depleted and crops grow slower. ☀️")
                water_tiles = [t for t in request.terrain_tiles if t.terrain_type == "water"]
                if water_tiles:
                    shrunk_count = max(1, int(3 * quality_factor))
                    for tile in random.sample(water_tiles, min(len(water_tiles), shrunk_count)):
                        map_updates.append(sim_pb2.MapUpdate(
                            x=tile.x,
                            y=tile.y,
                            terrain_type="grass",
                            object_type="",
                            object_amount=0
                        ))
                    state_tracker.add_thought_c(f"Triggered Drought: shrunk {shrunk_count} water tiles into grass.")
            elif econ_event == "swarm":
                injected_events.append("🌾 KI Wirtschaftsleben: Locust Swarm! A cloud of locusts has devoured several farm crop fields! 🦟")
                crop_tiles = [t for t in request.terrain_tiles if t.terrain_type == "crops"]
                if crop_tiles:
                    devoured_count = max(1, int(3 * quality_factor))
                    for tile in random.sample(crop_tiles, min(len(crop_tiles), devoured_count)):
                        map_updates.append(sim_pb2.MapUpdate(
                            x=tile.x,
                            y=tile.y,
                            terrain_type="grass",
                            object_type="",
                            object_amount=0
                        ))
                    state_tracker.add_thought_c(f"Triggered Locust Swarm: devoured {devoured_count} crop fields.")
            elif econ_event == "harvest":
                injected_events.append("🌾 KI Wirtschaftsleben: Perfect weather brings a Bumper Harvest! All crop fields are boosted with extra yield. 🌾")
                crop_tiles = [t for t in request.terrain_tiles if t.terrain_type == "crops"]
                boost_amount = int(45 * quality_factor)
                for tile in crop_tiles:
                    map_updates.append(sim_pb2.MapUpdate(
                        x=tile.x,
                        y=tile.y,
                        terrain_type="crops",
                        object_type="crops",
                        object_amount=min(100, tile.object_amount + boost_amount)
                    ))
                state_tracker.add_thought_c(f"Triggered Bumper Harvest: boosted crops by +{boost_amount}% yield based on quality factor.")

        # 4. Instantiate Mesa simulation model with the received state
        model = MesaSimModel(request)
        
        # 5. Advance the model by 1 step
        model.step()
        
        # 6. Harvest decisions from Mesa agents and apply active law modifiers
        decisions = []
        for agent in model.mesa_agents:
            if agent.role == "Human Explorer" or agent.agent_id.startswith("human-"):
                # Bypass Mesa AI and keep human explorer target and status intact
                dec = sim_pb2.AgentDecision(
                    agent_id=agent.agent_id,
                    target=sim_pb2.Position(x=agent.target[0], y=agent.target[1]),
                    status=agent.status,
                    mood=agent.mood,
                    energy=int(agent.energy),
                    resources=int(agent.resources),
                    waste=int(agent.waste),
                )
                decisions.append(dec)
                continue

            # Apply active law modifiers to agent decisions
            if "Builder Subsidy Act" in state_tracker.active_laws and agent.role == "Builder":
                agent.resources = min(100, agent.resources + 15)
                agent.energy = min(100, agent.energy + 10)
            if "Equitable Resource Sharing Act" in state_tracker.active_laws:
                if agent.resources < 45:
                    agent.resources = min(100, agent.resources + 15)

            agreement_proto = None
            if agent.agreement:
                agreement_proto = sim_pb2.Agreement(
                    partner_id=agent.agreement.partner_id,
                    type=agent.agreement.type,
                    target_x=agent.agreement.target_x,
                    target_y=agent.agreement.target_y,
                    ticks_left=agent.agreement.ticks_left
                )
            
            dec = sim_pb2.AgentDecision(
                agent_id=agent.agent_id,
                target=sim_pb2.Position(x=agent.target[0], y=agent.target[1]),
                status=agent.status,
                mood=agent.mood,
                energy=int(agent.energy),
                resources=int(agent.resources),
                waste=int(agent.waste),
                agreement=agreement_proto
            )
            decisions.append(dec)
            
        return sim_pb2.DecideActionsResponse(
            decisions=decisions,
            grass_policy=grass_policy,
            forest_policy=forest_policy,
            map_updates=map_updates,
            injected_events=injected_events,
            active_laws=state_tracker.active_laws,
            manager_a_thoughts=state_tracker.manager_a_thoughts,
            manager_b_thoughts=state_tracker.manager_b_thoughts,
            manager_c_thoughts=state_tracker.manager_c_thoughts
        )


def serve():
    port = os.environ.get("PORT", "50051")
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    sim_pb2_grpc.add_AgentDecisionServiceServicer_to_server(AgentDecisionServicer(), server)
    server.add_insecure_port(f"[::]:{port}")
    print(f"Mesa gRPC AgentBehaviorService running on :{port}...")
    server.start()
    server.wait_for_termination()


if __name__ == "__main__":
    serve()
