import sys
import os
import random
from concurrent import futures
import grpc
import mesa

# Add current folder to path for gRPC imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sim.v1 import sim_pb2
from sim.v1 import sim_pb2_grpc


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
        
        adjacent_tiles = []
        for pos in adjacent_positions:
            tile = self.model.terrain_map.get(pos)
            if tile:
                adjacent_tiles.append(tile)
                if tile.terrain_type in ["water", "forest", "crops"]:
                    is_next_to_water_or_forest_or_crops = True
                if tile.terrain_type == "rock":
                    is_next_to_rock = True
                if tile.terrain_type == "home":
                    is_next_to_home = True
                if tile.terrain_type == "market":
                    is_next_to_market = True
                if tile.terrain_type == "court":
                    is_next_to_court = True

        current_tile = self.model.terrain_map.get(self.position)
        if current_tile:
            if current_tile.terrain_type == "home":
                is_next_to_home = True
            if current_tile.terrain_type == "market":
                is_next_to_market = True
            if current_tile.terrain_type == "court":
                is_next_to_court = True

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
                if is_next_to_court:
                    self.status = "attending tribunal"
                    self.mood = "reflective"
                else:
                    self.status = "heading to court"
                    self.mood = "reflective"
                    self.target = self.model.find_nearest_resource(self.position, ["court"])
            
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
                # Find a walkable neighboring cell
                neighbors = self.grid.get_neighborhood(pos, moore=False, include_center=False)
                for n_pos in neighbors:
                    n_tile = self.terrain_map.get(n_pos)
                    if n_tile and n_tile.terrain_type not in ["water", "rock"]:
                        dist = self.toroidal_distance(start_pos, n_pos)
                        if dist < min_dist:
                            min_dist = dist
                            best_pos = n_pos
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
        if self.walkable_tiles:
            return random.choice(self.walkable_tiles)
        return (0, 0)


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

        # 3. Instantiate Mesa simulation model with the received state
        model = MesaSimModel(request)
        
        # 4. Advance the model by 1 step
        model.step()
        
        # 5. Harvest decisions from Mesa agents
        decisions = []
        for agent in model.mesa_agents:
            # Rebuild agreement proto if present
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
            forest_policy=forest_policy
        )


def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    sim_pb2_grpc.add_AgentDecisionServiceServicer_to_server(AgentDecisionServicer(), server)
    server.add_insecure_port("[::]:50051")
    print("Mesa gRPC AgentBehaviorService running on :50051...")
    server.start()
    server.wait_for_termination()


if __name__ == "__main__":
    serve()
