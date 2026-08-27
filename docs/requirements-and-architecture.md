# IA3 SimWorld – Fachliche Anforderungen & Architektur-Entscheidungen

Dieses Dokument dokumentiert alle fachlichen Anforderungen, die getroffenen Architekturentscheidungen und den Tech-Stack der IA3 SimWorld-Plattform.

---

## 1. Fachliche Anforderungen (Requirements)

Seit Projektbeginn wurden folgende Anforderungen an das System gestellt und implementiert:

### Welt- und Landschaftsgestaltung
- **Erweiterte Weltgröße:** Die Karte wurde von der ursprünglichen Skelettgröße (24x18) über 48x36 schließlich auf ein großzügiges **96x96-Raster** skaliert (9216 Kacheln). Dies bietet eine quadratische, weite Welt für die Simulation.
- **Gehöfte und Siedlungen:** Es wurden 3 prozedurale Gehöfte (`home` / `🏡`) als Siedlungszentren platziert, die soziale Interaktionen und die Regeneration der Agenten (Schlafen bei Erschöpfung) steuern.
- **Organischer Geländegenerator:** Anstelle von rein zufälligen Tiles wurde ein **2D-Value-Noise-Generator** mit Kosinus-Interpolation und fraktalen Oktaven (Fractional Brownian Motion, FBM) implementiert, um zusammenhängende, realistische Kontinente, Seen, Wälder und Gebirgszüge zu generieren.
- **Prozedurales Straßennetz:** Einbindung von Wegen (`road` / `🛣️`), die über toroidales A* die 3 Siedlungszentren kollisionsfrei miteinander verbinden.
- **Dynamische, nachwachsende Ressourcen:** Wälder tragen Beeren (`berries`), die von Agenten geerntet werden (woraufhin sie schrumpfen) und im 8-Tick-Rhythmus nachwachsen.
- **Biologischer Abfallabbau:** An Felsen können Agenten ihren Abfall entsorgen. Es bilden sich Müllberge (`waste_pile`), die sich biologisch abbauen.
- **Regenerierung:** Ein Button in der UI ermöglicht es, das Gelände der Welt im laufenden Betrieb neu zu generieren.
- **Visualisierung im Nachtmodus:** Die gesamte UI sowie der leere äußere Rahmen wurden komplett in ein dunkles Nacht-Theme (`#0f172a`) überführt.

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

### Interaktivität & UI
- **Echtzeit-WebSockets:** Die Benutzeroberfläche empfängt Tick-Zustands-Broadcasts per bidirektionalem WebSocket-Streaming vom API-Gateway.
- **Fokusauswahl:** Per Klick auf ein Agenten-Symbol oder in der Statustabelle wird dieser Agent golden fokussiert. Kein Springen/Zoom-Bug beim Auswählen mehr.
- **Zielvisualisierung:** Das aktive Ziel des ausgewählten Agenten wird auf der Live-Karte mit einem Ziel-Symbol (`🎯`) markiert, um seine Absichten transparent darzustellen.
- **Live Event Feed:** Die Sidebar zeigt Ereignisse (Treffen, Vereinbarungen, Konsum, Erholung) sofort als Scrolling-Feed an.
- **Admin Dashboard:** Ein zweiter Tab visualisiert Echtzeit-Ressourcenstatistiken, Kooperationsregeln (Agreements) und die Live-Interessen-Matrix aller Agenten.

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


