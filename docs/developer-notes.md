# IA3 SimWorld – Entwickler-Notizen

Dieses Dokument beschreibt den Betrieb der IA3 SimWorld-Plattform im lokalen Entwicklungsmodus sowie das Deployment in Kubernetes (Minikube).

---

## 1. Lokaler Betrieb (Non-K8s)

Für eine schnelle lokale Entwicklung können die Services als native Hintergrundprozesse auf dem Host gestartet und gestoppt werden. Die Steuerung erfolgt über automatisierte Skripte im Ordner `scripts/dev/` (auch über `make dev-start`/`dev-stop`/`dev-diagnose` verfügbar):

- **Starten:** Führt Port-Prüfungen durch und startet alle Go-, Python- und Node-Services im Hintergrund.
  ```bash
  ./scripts/dev/start.sh     # oder: make dev-start
  ```
- **Diagnose & Status:** Prüft, ob alle lokalen Ports aktiv belegt und `/healthz`-Endpunkte erreichbar sind.
  ```bash
  ./scripts/dev/diagnose.sh  # oder: make dev-diagnose
  ```
- **Stoppen:** Beendet alle gestarteten Hintergrundprozesse des aktuellen Benutzers sauber.
  ```bash
  ./scripts/dev/stop.sh      # oder: make dev-stop
  ```

Für Abwärtskompatibilität können auch weiterhin `./scripts/dev/start-local.sh`, `./scripts/dev/stop-local.sh` und `./scripts/dev/diagnose-local.sh` verwendet werden.

### Erwartete Endpunkte im lokalen Betrieb:
- **Web UI:** http://localhost:13000 (bzw. Entwicklungsmodus `:3000`)
- **API Gateway:** http://localhost:18080 (Healthz: `/healthz`, State-API: `/api/state`)
- **World Simulator (world-sim):** http://localhost:18081 (Healthz: `/healthz`)
- **Agenten-Service (gRPC):** `localhost:50051`

---

## 2. Minikube Deployment (Kubernetes)

Das gesamte System lässt sich vollautomatisch in einer lokalen Kubernetes-Umgebung (Minikube) mittels Helm orchestrieren. Die Steuerung kann über das `Makefile` oder vollautomatisiert über die Skripte im Ordner `scripts/prod/` erfolgen:

### Vollautomatisiertes K8s-Management (Empfohlen):

- **Komplettes K8s Setup Starten:** Startet Minikube, baut/verifiziert alle vier Anwendungs-Images, deployt beide Multiplayer-Instanzen (`ia3` und `ia3-two`) via Helm, wartet auf die Pod-Bereitschaft und startet das Port-Forwarding im Hintergrund.
  ```bash
  ./scripts/prod/start.sh     # oder: make prod-start
  ```
- **K8s Status & Diagnose:** Führt tiefe Diagnosechecks auf Minikube-Ebene, Pod- und Service-Status, Port-Forward-Tunnels sowie HTTP-Endpunkt-Snapshots aus.
  ```bash
  ./scripts/prod/diagnose.sh  # oder: make prod-diagnose
  ```
- **K8s Setup Stoppen:** Stoppt alle Hintergrund-Portforwarder und deinstalliert die Helm-Releases sauber.
  ```bash
  ./scripts/prod/stop.sh      # oder: make prod-stop
  ```

### Manueller K8s-Workflow (Alternative):

1. **Cluster starten & Helm-Chart deployen:**
   Erstellt den Kubernetes-Namespace `ia3`, baut/lädt die Infrastruktur (PostgreSQL, Redis) und deployt die SimWorld-Anwendungs-Pods.
   ```bash
   make dev-up
   ```

2. **Pod- und Service-Status prüfen:**
   Zeigt alle laufenden Pods, deren Bereitschaft (Readiness) und die K8s-Services im Namespace an.
   ```bash
   make dev-status
   ```

3. **Port-Forwarding aktivieren:**
   Leitet die Kubernetes-Services sicher auf Ihre lokalen Ports weiter (API-Gateway auf `:18080`, Web UI auf `:13000`). Das Skript prüft vorab, ob bereits aktive Weiterleitungen existieren.
   ```bash
   make port-forward
   ```

4. **Port-Forwarding Status prüfen:**
   Liefert eine detaillierte Übersicht über aktive Forwarder, deren Prozess-IDs (PIDs) und lokale Zugriffs-URLs.
   ```bash
   make port-forward-status
   ```

5. **Entwicklung & Live-Updates (Hot-Reloading):**
   Wenn Sie Codeänderungen vornehmen, können Sie den entsprechenden Service (oder alle Services) mit einem einzigen Befehl im Minikube-Cluster neu bauen und im Kubernetes-Deployment aktualisieren (rollout restart):
   ```bash
   # Einen einzelnen Service neu bauen und live schalten (z. B. das Web-Frontend):
   ./scripts/prod/update.sh web-client  # oder: make prod-update-web

   # Die Go-Simulation neu bauen und live schalten:
   ./scripts/prod/update.sh world-sim   # oder: make prod-update-sim

   # Alle Services auf einmal neu bauen und live schalten:
   ./scripts/prod/update.sh all         # oder: make prod-update
   ```
   Dieses Skript baut das Docker-Image direkt im Minikube-Daemon neu, stößt ein `rollout restart` in allen aktiven Namespaces (`ia3` und `ia3-two`) an und wartet, bis die Aktualisierung erfolgreich abgeschlossen ist.

   *Alternativer manueller Weg:*
   ```bash
   minikube image build -t web-client:dev apps/web-client
   minikube kubectl -- rollout restart deployment/web-client -n ia3
   ```

6. **Abbau & Bereinigung:**
   Deinstalliert die Helm-Release im Namespace:
   ```bash
   make dev-down
   ```
   Um den gesamten Namespace inklusive aller Volumes und Services vollständig zu löschen (Nuke):
   ```bash
   make nuke
   ```

---

## 3. Architektur & Port-Belegungen

- **`apps/world-sim` (Port 8081 / K8s internal):** Authoritative Go-Simulation, verwaltet Ticks und physischen State.
- **`apps/agent-service` (Port 50051 / K8s internal):** Python-Mesa-Agentenlogik, steuert kognitive Verhaltenszyklen via gRPC.
- **`apps/api-gateway` (Port 8080 -> local 18080):** Go-Echtzeit-Schnittstelle (HTTP & WebSockets).
- **`apps/web-client` (Port 3000 -> local 13000):** Next.js-Frontend mit interaktivem HTML5 Canvas.
