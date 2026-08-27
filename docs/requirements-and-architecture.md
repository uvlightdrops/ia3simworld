# IA3 SimWorld – Fachliche Anforderungen & Architektur-Entscheidungen

Dieses Dokument dokumentiert alle fachlichen Anforderungen, die getroffenen Architekturentscheidungen und den Tech-Stack der IA3 SimWorld-Plattform.

---

## 1. Fachliche Anforderungen (Requirements)

Seit Projektbeginn wurden folgende Anforderungen an das System gestellt und implementiert:

### Welt- und Landschaftsgestaltung
- **Standard-OpenSIM-Startwelt (256x256):** Die Simulation erzeugt beim Start direkt ein komplettes, standardkonformes OpenSIM-Gebiet der Größe **256x256 Kacheln (Tiles)**. Dies garantiert eine hochauflösende 1-zu-1-Kopplung mit virtuellen 3D-Welten.
- **Gehöfte und Siedlungen:** Es wurden prozedurale Gehöfte (`home` / `🏡`) als Siedlungszentren platziert, die soziale Interaktionen und die Regeneration der Agenten (Schlafen bei Erschöpfung) steuern.
- **Mäandernder Fluss mit Gabelung:** Ein majestätischer Hauptstrom der Breite 4 windet sich prozedural von oben nach unten durch das Gelände, inklusive eines Seitenarms (Gabelung), der sich organisch zur Seite hin abspaltet.
- **Reduzierte Seen:** Die Anzahl isolierter, störender Seen wurde verringert, um mehr zusammenhängendes Bauland zu schaffen.
- **Abstands-Constraint für Infrastrukturen:** Marktplatz (`market` / `🛒`) und Gerichtshof (`court` / `⚖️`) werden automatisch in einem systematischen Abstand von mindestens 10 Einheiten zueinander und zu allen Siedlungszentren platziert.
- **Organischer Geländegenerator:** Ein kontinuierlicher **2D-Value-Noise-Generator** mit Kosinus-Interpolation und fraktalen Oktaven (FBM) erzeugt prozedural zusammenhängende Landschaften.
- **Prozedurales Straßennetz:** Einbindung von Wegen (`road` / `🛣️`), die über toroidales A* die Siedlungszentren kollisionsfrei verbinden.
- **Dynamische Ressourcen & Landwirtschaft:**
  - **Felder anlegen:** Builder-Agenten entscheiden im Nachmittags-Arbeitszyklus selbstständig, Weizenfelder (`crops`) anzulegen, und kultivieren diese aktiv für 3 Ticks.
  - **Wildbeeren-Knappheit:** Wildbeeren-Vorkommen im Wald wurden auf 20% Dichte reduziert, um gezielte, organisierte Landwirtschaft in den Mittelpunkt zu rücken.
- **Biologischer Abfallabbau:** An Felsen entsorgen Agenten Abfälle. Die entstehenden Müllhaufen (`waste_pile`) bauen sich im Laufe der Zeit biologisch ab.
- **Landschafts- & Geschwindigkeitsregler:** Über Schieberegler auf dem Admin-Dashboard lassen sich Flussbreite, Seen-Häufigkeit, Beeren-Dichte sowie die **Simulationsgeschwindigkeit (Tick Rate)** im laufenden Betrieb fließend anpassen.
- **Visualisierung im Nachtmodus:** Die gesamte UI sowie der leere äußere Rahmen wurden komplett in ein ansprechendes, dunkles Retro-Theme (`#0f172a`) überführt.

### Unendliche Weltexpansion & Sektorensystem
- **Grenzlose Entdeckungen:** Sobald sich Agenten oder Spieler den physikalischen Grenzen des aktuellen Sektors nähern, generiert die kontinuierliche Rauschfunktion nahtlos angrenzende Sektoren der Größe **256x256**.
- **Speicherung und Synchronisation:** Neu entdeckte Sektoren werden persistent für die aktive Spielrunde im Server-Speicher abgelegt und über alle gekoppelten Cluster-Nodes hinweg in Echtzeit synchronisiert.
- **Explorationsregister (Tribunal):** Agenten kartografieren die Welt, kehren anschließend nach Hause zurück und tragen neu entdeckte Sektoren in das Register des Gerichtshofs (Exekutive) ein, was als Live-Ereignis im Event-Feed gemeldet wird.

### Agenten-Verhalten und -Intelligenz
- **Kollisionsregeln:** Agenten können sich ausschließlich auf Grasland (`grass`), Straßen (`road`) und Wald-Tiles (`forest`) bewegen. Wasser (`water`) und Berge/Felsen (`rock`) blockieren die Bewegung.
- **Zielstrebigkeit & Rollen-Verhaltensprofile (Mesa):**
  - **Mesa-Integration:** Verhaltensentscheidungen wurden vollständig an das Python-Mesa-Framework via gRPC übergeben.
  - **Kein Zufallswalk:** Random Walking wurde durch deterministische, stateful Verhaltensroutinen pro Rolle ersetzt:
    - **Scout:** Sucht gezielt weit entfernte Wald- und Wasser-Ressourcen ab, um sie zu kartieren.
    - **Builder:** Patrouilliert das Straßennetz und Gehöfte zwecks Instandhaltung.
    - **Researcher:** Reist zwischen Gehöften hin und her und verbleibt dort in einem stateful 5-Tick "Studien- & Dwell-Zyklus" (mit Live-Anzeige im Status).
    - **Tracker:** Sichert den äußeren Perimeter der Karte, indem er feste Wegepunkte im Viereck abläuft.
- **Hochintelligente toroidal-Wegfindung (High-IQ):**
  - **A*-Suchalgorithmus (A-Star):** Ein hocheffizienter A*-Suchalgorithmus ersetzt die einfache Breitensuche (BFS).
  - **Toroidale Geometrie:** Die Wegfindung berücksichtigt den Wrap-Around der Welt an den Rändern (oben/unten, links/rechts) und nutzt eine angepasste toroidale Manhattan-Metrik als Heuristik.
  - **Smart Escape (Befreiungslogik):** Falls ein Agent durch plötzliche Landschafts-Regenerierung komplett eingekesselt ist, weicht er automatisch auf freie, benachbarte Felder aus, um Sackgassen selbstständig aufzulösen.

### Interaktivität, UI & UX-Feinheiten
- **Echtzeit-WebSockets:** Die Benutzeroberfläche empfängt Tick-Zustands-Broadcasts per bidirektionalem WebSocket-Streaming vom API-Gateway.
- **Flüssige Agenten-Bewegung (LERP):** Ein LERP-basierter Interpolationsmodus ermöglicht flüssiges Gleiten der Spielfiguren auf dem Canvas. Dies kann über den "Smooth"-Schalter im Overlay ein- und ausgeschaltet werden.
- **Interaktiver Human Player (HPC):** Spieler können über Tastatur (WASD / Pfeiltasten) eine eigene Human-Figur direkt auf dem Canvas-Grid steuern. Die Navigation wird durch ein schickes Tastaturbadge samt Hover-Anleitungstooltip platzsparend erklärt.
- **Übersichtliches Kartenbild:** Die Bewegungspfade für Ziel-Kacheln (`showPaths`) sind standardmäßig ausgeblendet (über eine Checkbox reaktivierbar), was ein sauberes Rendering sichert.
- **Erweitertes Dashboard-Layout:**
  - **Social Threefolding Tabs:** Die Benutzeroberfläche besitzt drei eigenständige Dashboards: "Rechtssphäre" (Verhandlungsthemen und Gesetzestexte), "Geistesleben" (Agenteninteressen und Bildung) sowie "Wirtschaftsleben" (Ressourcenkreisläufe, Abfallabbau und Wirtschaftsentwicklung).
  - **Vollständige Tabelle:** Die Agententabelle in der Sidebar listet alle NPC-Vitalwerte komplett und scrollbar auf.
  - **Event-Feed-Maximierung:** Die Höhe des Event-Feeds wurde verdoppelt (auf 360px), um historische und aktuelle Ereignisse noch komfortabler zu sichten.
  - **Anpassbarer Startup-Fokus:** Die Karte berechnet ihre Containermaße beim Laden fehlerfrei und zentriert sich automatisch. Das Gitternetz (Grid) ist standardmäßig deaktiviert.

### Dezentrale Spielknoten & Multiplayer (Shared World)
- **Minikube-Orchestrierung:** Über `make dev-up-two` lässt sich vollautomatisch eine zweite, eigenständige Simulationsinstanz im Namespace `ia3-two` auf Minikube hochfahren.
- **Konfliktfreies Port-Forwarding:** Port-Forwarding tunnelled Instanz 1 auf `:13000`/`:18080` und Instanz 2 auf `:13001`/`:18081`.
- **Game-Node-Anzeige im Header:** Ein spezielles Element im Header zeigt die physische Knotentopologie unmissverständlich an (zeigt den eigenen Node-Namen zuerst und führt verbundene Master-Nodes dahinter an, z.B. `ia3, ia3-two`).
- **Gemeinsame Welt (Shared World Mode):** Ein dezentraler Client-Modus spiegelt den gesamten State des Master-Gateway in Echtzeit im UI wider. 
- **Sicherheits-Schutz für Sekundärknoten:** Auf unautorisierten Client-Nodes (ia3-two) werden kritische Steuerungselemente (Start, Pause, Regenerate, Szenario-Trigger) ausgeblendet, um Missbrauch zu unterbinden. Nur die master-autorisierte UI (ia3) behält die volle Simulationskontrolle.

### Entwickler-Tooling
- **Zuverlässiges Orchestrierungs-Skripting:** Start- und Stop-Skripte verwalten alle lokalen Prozesse sauber und robust.
- **Sicherer Port-Check:** Das Startskript prüft Ports, bevor Dienste gestartet werden, um Port-Kollisionen zu vermeiden.
- **Diagnose-Skript:** Ein dediziertes Skript führt einen tatsächlichen Port- und Healthz-Check durch und liefert einen klaren Überblick über alle laufenden Dienste des Users.

---

## 2. Tech-Stack-Entscheidungen

- **Frontend (Web Client):** Next.js 14 + React 18 mit TypeScript (Standardport `13000`).
- **API-Gateway:** Go HTTP/WS-Server (Standardport `18080`) mit Gorilla-WebSockets und CORS-Handling.
- **World Simulator (world-sim):** Go 1.22 (Standardport `18081`) zur Ausführung der autoritativen Simulations-Schleife (Ticks) und zur Berechnung von Noise und A*-Pfaden in Mikrosekunden.
- **Agenten-Service (agent-service):** Python 3.12 (Standardport `50051`) mit dem **Mesa-Framework** zur Modellierung von Multi-Agenten-Beziehungen, das über gRPC (`sim.proto`) angebunden ist.
- **Lokale Infrastruktur:** Ausführung der Services über native Binaries/Interpreter (für Ubuntu Linux 24 optimiert).

---

## 3. System-Konzepte & Funktionsweise

Dieses Kapitel beschreibt den aktuellen technischen Stand des Systementwurfs und die tragenden architektonischen Konzepte der SimWorld.

### Toroidale A*-Wegfindung für organische Maps
- **Konzept:** Die Agenten navigieren unter Verwendung einer toroidalen Manhattan-Metrik. Da sich die Welt an den Rändern nahtlos umbricht (Wrap-Around), sucht der hocheffiziente Go-basierte A*-Suchalgorithmus Pfade über die Weltgrenzen hinweg. Die Berechnung erfolgt in Mikrosekunden und ist auf Gras, Straßen und Wälder begrenzt.
- **Vorteil:** Keine Sackgassen an Rändern, extrem intelligente Routenwahl über weite Strecken und automatische Ausweichrouten bei spontanen Geländeregenerierungen.

### Zustandsloser Zustandstransfer via gRPC
- **Konzept:** Um Synchronisationskonflikte zu vermeiden, ist die Kommunikation zwischen dem Go-Simulator und dem Python-Mesa-Dienst vollständig zustandslos gestaltet. Go serialisiert in jedem Simulations-Tick den aktuellen Weltzustand und übergibt ihn an Python. Python instanziiert flüchtig das Mesa-Agentenmodell, führt den kognitiven Entscheidungszyklus durch und liefert die Bewegungsbefehle zurück. 
- **Verhaltensspeicher:** Da der gRPC-Dienst selbst zustandslos ist, werden rollen- und zeitbezogene Zustände (z. B. der 5-Tick-Lern-Countdown oder aktive Verträge) im `status`-Feld der Agenten persistiert und somit sicher hin- und hergereicht.

### Echtzeit-WebSocket-Broadcasts
- **Konzept:** Anstelle von ineffizientem HTTP-Polling hält das API-Gateway langlebige Verbindungen (`/api/ws`) zu allen Browser-Clients, pollt den Go-Simulator im 100ms-Intervall und streamt ressourcenschonende Broadcasts nur bei echten Tick-Erhöhungen.
- **Leistung:** Ermöglicht latenzfreie Updates im Millisekundenbereich bei minimaler CPU- und Netzwerklast.

### Ressourcen- und Müllkreislauf
- **Konzept:** Die physische Welt ist als dynamischer Ressourcenkreislauf modelliert. Wälder tragen Beeren (`berries`), welche sich bei Konsum der Agenten verbrauchen und stetig regenerieren. Bei Aktivität erzeugen Agenten Abfall, welcher gezielt an Fels-Kacheln (`rock`) als Müllberg (`waste_pile`) abgelagert wird und sich dort über Zeit biologisch abbaut. Beide Metriken sind im Admin-Dashboard live statistisch erfasst.

---

## 4. Roadmap zum Multiplayer-Spiel

Um die aktuelle Single-Instance-Simulation in ein robustes Multiplayer-Spiel zu verwandeln, müssen folgende technischen Säulen implementiert werden:

### Phase A: Echtzeit-Synchronisation (WebSockets)
- **Status:** **Erfolgreich implementiert.** WebSocket-Streaming im `api-gateway` und `world-sim` integriert. Bei jedem Simulations-Tick (`sim.tick.completed`) wird der veränderte Zustand sofort per Broadcast an alle verbundenen Spieler gestreamt.

### Phase B: Autoritativer Server & Command Queue (Eingabeverarbeitung)
- **Problem:** Spieler dürfen den Zustand nicht unkontrolliert direkt ändern.
- **Lösung:** Implementierung eines Command-Patterns. Spieler senden verschlüsselte Kommandos (z. B. `MoveCommand`, `UseItem`) an den Server. Diese werden dort validiert, in einer Thread-sicheren Input-Queue gesammelt und deterministisch im nächsten Tick-Durchlauf verarbeitet.

### Phase C: Raum- und Lobby-Management (Multi-Instance)
- **Problem:** Derzeit existiert nur eine einzige Weltkarte im Speicher von `world-sim`.
- **Lösung:** Ausbau des Simulators, sodass er mehrere unabhängige Spielräume (Rooms/Lobbies) dynamisch instantiieren und verwalten kann. Kopplung mit Redis zur schnellen Raum- und Zustandsspeicherung.

### Phase D: Clientseitige Interpolation & Vorhersage
- **Problem:** Ein Tick-Intervall von z. B. 500ms führt ohne Gegenmaßnahmen zu ruckartigen Sprüngen in der UI.
- **Lösung:** Next.js-Frontend um Interpolation erweitern. Die Positionen von Spielern und Agenten werden flüssig zwischen den Ticks animiert (z. B. via CSS-Transitions, HTML5 Canvas oder React Spring), um ein smoothes Spielerlebnis zu erzeugen.

---

## 5. Dezentrale Peer-to-Peer (P2P) Multiplayer-Architektur

Ein zukunftsweisendes Ziel ist es, den Spielern zu ermöglichen, eigene Bereitstellungs-Knoten (Nodes) zu betreiben, um gemeinsam am intelligenten Betrieb und an der Evolution der SimWorld mitzuwirken.

```text
               +-------------------------------------------------+
               |              Globales API-Gateway               |
               |          (Routing & Koordinations-Hub)          |
               +-------------------------------------------------+
                                      |
               +----------------------+--------------------------+
               | (gRPC / Libp2p / NATS Event Backbone)           |
               v                                                 v
+-----------------------------+                  +-----------------------------+
|    Spieler-Knoten 1 (Node)  |                  |    Spieler-Knoten 2 (Node)  |
|                             |                  |                             |
| +-------------------------+ |                  | +-------------------------+ |
| |       world-sim         | |                  | |       world-sim         | |
| |  (Simuliert Sektor A)   | |                  | |  (Simuliert Sektor B)   | |
| +-------------------------+ |                  | +-------------------------+ |
|              |              |                  |              |              |
|              v              |                  |              v              |
| +-------------------------+ |                  | +-------------------------+ |
| |      agent-service      | |                  | |      agent-service      | |
| | (Mesa-Gehirn für Sek A) | |                  | | (Mesa-Gehirn für Sek B) | |
| +-------------------------+ |                  | +-------------------------+ |
+-----------------------------+                  +-----------------------------+
               ^                                                 ^
               | (Interessen-Transmission)                       |
               +----------------------<--------------------------+
```

### Technische Umsetzung des dezentralen Node-Betriebs

#### 1. Föderierte Sektoren-Simulation (Sharding)
- Jedes Spiel-Universum wird in ein unendliches oder extrem großes Grid aufgeteilt.
- Spieler-Knoten können sich registrieren, um die Verantwortung für einen bestimmten **Sektor** (z. B. ein 96x96 Grid-Chunk) zu übernehmen.
- Wenn ein Agent oder Spieler die Sektorgrenze überschreitet, findet ein sicherer Handshake-Transfer statt. Der Knoten "Sektor A" übergibt das serialisierte Agenten-Zustandsobjekt per gRPC/Libp2p an den Knoten "Sektor B".

#### 2. Dezentrale Rechenleistung für Agenten-Gehirne (Brain-Nodes)
- Spieler können reine "Brain-Nodes" betreiben. Diese Nodes führen nur den Python-basierten `agent-service` aus.
- Sie "abonnieren" Agentengruppen des globalen Spiels, berechnen deren kognitive Entscheidungen (Mesa-Logik, soziale Synergien, Zukunftsplanung) und liefern die berechneten Verhaltensschritte zurück an den autoritativen Welten-Simulator.
- Zur Belohnung für bereitgestellte Compute-Leistung erhalten Node-Betreiber "Ressourcen-Credits" oder In-Game-Einfluss.

#### 3. Konsens- und Validierungsschicht
- Um Cheat-Versuche (z. B. Teleportation oder unendliche Ressourcenerzeugung durch manipulierte Nodes) zu verhindern, wird ein leichtgewichtiger Konsens-Algorithmus (z. B. Raft oder ein Proof-of-Authority über verifizierte Nodes) etabliert.
- Jeder Sektor-Knoten berechnet am Ende eines Ticks einen kryptografischen Merkle-Tree-Hash seines Zustands und teilt diesen mit Nachbarknoten. Unstimmigkeiten führen zum Entzug der Sektor-Autorität.

#### 4. Föderierte Wissensgraphen & Semantische Evolution (GraphLang)
- **Verknüpfung:** Die übertragenen Interessen und Vereinbarungen der Agenten werden als semantische Kanten und Knoten in einer dezentralen Graph-Datenbank (z. B. Neo4j, TerminusDB oder GraphLang-basiert) abgelegt.
- **Evolution:** Nodes tauschen diese Graphen kontinuierlich untereinander aus. Agenten können so Wissen, Rezepte und soziale Traditionen lernen, die auf physisch weit entfernten Nodes entstanden sind, und treiben damit die Evolution der SimWorld dezentral und intelligent voran.


