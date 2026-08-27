# IA3 SimWorld – Projekt-Roadmap (Mesa, Go & K8s)

Dieses Dokument fasst die fachlichen Entwicklungsziele der IA3 SimWorld-Plattform zusammen. Es ist gegliedert in bereits **erfolgreich umgesetzte Meilensteine** und **geplante zukünftige Aufgaben**.

Eine detaillierte Beschreibung der Verhaltensregeln und des Kooperations-Datenmodells findest du in [agent-logic-and-cooperation.md](./agent-logic-and-cooperation.md).

---

## 1. Web-Frontend & Visualisierung (Web UI)

### success Meilensteine (Erledigt)
- [x] **Hochperformantes Canvas-Rendering:** Umstieg von einem schweren DOM-Grid (9.216 Divs) auf ein flüssiges, ressourcenschonendes HTML5 Canvas.
- [x] **Intuitives Zoom & Pan:** Stufenloses Zoomen am Mauszeiger per Mausrad und freies Verschieben der Karte per Drag.
- [x] **Smarte Pfad- und Zielvisualisierung:** Zeichnen von gestrichelten Bewegungslinien vom Agenten zu seinem aktuellen Ziel sowie Markieren des Ziels mit einem Ziel-Symbol (`🎯`).
- [x] **Echtzeit Live-Feed Sidebar:** Anzeige von Ticks, Agenten-Details (Rolle, Energie, Müll, Verträge) und einem scrolling Event-Log in einer platzsparenden, fixierten rechten Spalte.
- [x] **Interaktive Hover-Tooltips:** Zeigen beim Bewegen der Maus über Kacheln sofort Koordinaten, Gelände, Ressourcenmengen und dort stehende Agenten an.
- [x] **Blinken & Pulsieren:** Visuelle Hervorhebung des ausgewählten Agenten durch eine sanft pulsierende Aura auf dem Canvas.

### backlog Aufgaben (Offen / Geplant)
- [ ] **Grafische Sprites & Texturen:** Ersetzen der geometrischen Canvas-Formen und Emojis durch ansprechende 2D-Kachelgrafiken (Pixel-Art/Sprites) für ein echtes Spiele-Gefühl.
- [ ] **Clientseitige Bewegungs-Interpolation:** Flüssige Animation der Agenten-Bewegungen zwischen zwei Simulations-Ticks, um Ruckeln bei langsameren Tickraten zu verhindern.
- [ ] **Admin-Dashboard Steuerungsparameter:** Ausbau der Admin-Ansicht im Frontend zur dynamischen Anpassung von Landschaftsparametern (Seen-Anzahl, Fluss-Gabelungen, Ressourcen-Dichte) in Echtzeit.

---

## 2. Kognitives Agentenverhalten (Python-Mesa-Service)

### success Meilensteine (Erledigt)
- [x] **Zustandsloses gRPC-Gehirn:** Etablierung einer gRPC-Kommunikation, bei der Go den State liefert und Python (Mesa) zustandslos Aktionen entscheidet.
- [x] **Mesa-Rollenprofile:** Vollständiger Umstieg von zufälliger Bewegung (Random Walk) auf deterministische Verhaltensroutinen pro Rolle (Scout, Builder, Researcher, Tracker).
- [x] **Interessen- & Kooperationsdatenmodell:** Vollständige Modellierung von sozialen Interessen sowie von Kooperations-Vereinbarungen (Agreements) und deren Übertragung zwischen Agenten.
- [x] **Visueller Ressourcenkreislauf:** Beeren wachsen nach und werden abgeerntet (Darstellung als Baum vs. Stumpf); Müllberge entstehen auf Felsen und bauen sich ab (inklusive roter Überlastungswarnung).
- [x] **Tageszeitabhängige soziale Routinen:** Strukturierung des Tages in Nacht (0-5: Schlafen am Gehöft), Morgen (6-11: Handeln am Marktplatz), Mittag/Arbeit (12-17: Rollenroutinen) und Abend (18-23: Versammlung am Gerichtshof).
- [x] **Ressourcenknappheit & Feldfrüchte:** Integration von Feldfrüchten (`crops` / 🌾) als Nahrungskette, Verdopplung des Ressourcenverbrauchs (-2 pro Tick) und Einführung eines Hunger-Malus (-3 Energie pro Tick bei 0 Ressourcen).

### backlog Aufgaben (Offen / Geplant)
- [ ] **Erweiterte Landwirtschaft:** Dynamisches Anlegen und Bebauen von landwirtschaftlichen Feldern durch die Agenten im Spielverlauf statt rein statischer Platzierung.
- [ ] **Wildfrüchte-Knappheit:** Signifikante Reduzierung der Wildbeeren-Dichte auf der Karte zur Erhöhung des Ernte-Drucks und stärkere Priorisierung von Nutzpflanzen.
- [ ] **Prozedurale Flusslandschaft mit Verzweigungen:** Implementierung eines prozeduralen Algorithmus in Go zur Generierung eines mäandernden Flusses mit Gabelungen (Abzweigungen) und reduzierter Anzahl an isolierten Seen.
- [ ] **Erweiterter Waren- und Tauschhandel:** Agenten können Ressourcen untereinander tauschen und Verträge über die Erledigung von Bau- oder Ernteaufträgen schließen.
- [ ] **Semantische Transmission (Wissens-Graph):** Speicherung von gelerntem Wissen und sozialen Traditionen in einem dezentralen Wissensgraphen (z. B. via GraphLang).

---

## 3. Kubernetes Deployment (Minikube & Helm)

### success Meilensteine (Erledigt)
- [x] **Kubernetes-Konformität:** Erstellung moderner, stabiler Multi-Stage Dockerfiles für Go-Dienste und den Python-Service.
- [x] **Helm-Chart-Integration:** Vollständiges Helm-Chart (`ia3-local`) für Minikube mit integrierten Deployments, Services und stabilen PostgreSQL-/Redis-Datenbanken.
- [x] **Port-Forwarding-Automation:** Skripte zum automatisierten Port-Forwarding von K8s in den Host, inklusive Überprüfung auf bereits laufende Forwarder.
- [x] **Einfaches Command-Tooling:** Direkte Make-Befehle (`make dev-up`, `make port-forward`, `make port-forward-status`) zur Steuerung des K8s-Lifecycles.

### backlog Aufgaben (Offen / Geplant)
- [ ] **Production Readiness / CI-CD:** Anbindung an ein externes Container-Registry (z. B. Harbor via Skopeo) und Hinzufügen von automatisierten Ingress-Controllern für den externen Zugriff.

---

## 4. Dezentrale Multiplayer-Architektur (Multi-Node / P2P)

### backlog Aufgaben (Offen / Geplant)
- [ ] **Föderiertes Sharding (Sektor-Knoten):** Aufteilung der Weltkarte in eigenständige, von verschiedenen Spielern gehostete Chunks (Grid-Shards) mit toroidalem Grenzübertritts-Protokoll.
- [ ] **Dezentraler Konsens-Algorithmus:** Leichtgewichtiger Validierungs-Mechanismus (z. B. Raft-Konsens), um Cheat-Versuche durch manipulierte Sektor-Nodes zu unterbinden.
- [ ] **Compute-Sharing (Brain-Nodes):** Möglichkeit für Spieler, reine Berechnungs-Nodes für Agenten-Entscheidungen im globalen Netz bereitzustellen.

