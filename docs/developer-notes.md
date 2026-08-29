# IA3 SimWorld – Entwickler-Notizen

Dieses Dokument beschreibt den aktuellen, praktischen Entwicklungs- und Betriebsweg für IA3 SimWorld.

## 1. Grundprinzip

- **Lokale Entwickler-Orchestrierung** läuft über die **Python-CLI** in `scripts/cli.py`.
- **Make** ist nur noch eine dünne, bequeme Frontdoor.
- **Minikube/Kubernetes** bleibt der Weg für Cluster-ähnliche Entwicklung und spätere Produktion.
- **Docker Compose** startet lokale Basisdienste wie PostgreSQL und Redis.

## 2. Lokaler Betrieb

Für direkte lokale Entwicklung werden die Dienste als Host-Prozesse gestartet.

### Starten

```bash
make dev-start
# oder direkt:
python3 scripts/cli.py dev-lokal-start --nodes "[1,2,3]" --services "web,api,sim,agent"
```

Kurzformen für Nodes:

```bash
make dev-lokal-start NODES="1"
make dev-lokal-start NODES="1,2"
make dev-lokal-start NODES="[1,2]"
```

### Stoppen

```bash
make dev-stop
# oder direkt:
python3 scripts/cli.py dev-lokal-stop --nodes "[1,2,3]" --services "web,api,sim,agent"
```

### Status

```bash
python3 scripts/cli.py dev-lokal-status --nodes "[1,2,3]" --services "web,api,sim,agent"
```

### Lokale Ports pro Node

- **Web UI:** `12000 + (i - 1)`
- **API Gateway:** `17080 + (i - 1)`
- **World Sim:** `17180 + (i - 1)`
- **Agent Service:** `50051 + (i - 1)`

Beispiel:

- Node 1: Web `12000`, API `17080`, Sim `17180`, Agent `50051`
- Node 2: Web `12001`, API `17081`, Sim `17181`, Agent `50052`

## 3. Minikube / Kubernetes

Für lokale Cluster-Entwicklung und spätere Cloud-Nähe werden Helm und Minikube genutzt.

### Starten

```bash
make dev-up
```

### Stoppen

```bash
make dev-down
```

### Status

```bash
make dev-status
```

### Zusätzliche Föderationsknoten

```bash
make dev-up-2
make dev-up-3
make dev-down-2
make dev-down-3
```

### Minikube-Ports

- **ia3 / Node 1:** Web `13000`, Gateway `18080`
- **ia3-2 / Node 2:** Web `13001`, Gateway `18081`
- **ia3-3 / Node 3:** Web `13002`, Gateway `18082`

## 4. Wichtige Befehle

```bash
make proto        # gRPC-Schemas generieren
make logs         # world-sim Logs im K8s-Namespace ansehen
make nuke         # Namespace komplett entfernen
```

## 5. Technische Einordnung

- Die Python-CLI ist der eigentliche Orchestrierungs-Root.
- Make bleibt als stabile, kurze Nutzerschnittstelle erhalten.
- K8s- und Minikube-Befehle im Makefile sind bewusst noch direkt, weil sie aktuell die verlässlichste Frontdoor sind.
- Für komplexere K8s-Automation sollte später die Python-CLI erweitert werden, nicht Bash.

## 6. Typische Empfehlung

- **Lokale Dev-Starts:** `make dev-start`
- **Lokales Stoppen:** `make dev-stop`
- **Cluster-/Minikube-Start:** `make dev-up`
- **Cluster-/Minikube-Status:** `make dev-status`
- **Proto-Generierung:** `make proto`
