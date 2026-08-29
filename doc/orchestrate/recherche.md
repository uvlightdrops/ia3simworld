# Orchestrierung heute: kurzer Praxis-Überblick

Diese Übersicht fasst zusammen, wie moderne Projekte Orchestrierung meist aufteilen.
Für IA3 ist vor allem wichtig: nicht alles in ein Tool pressen.

## 1. Was die Werkzeuge typischerweise tun

### Local / Developer-Orchestrierung

- **Make / just / Task**: kurze Befehlsfrontends für wiederkehrende Entwickler-Kommandos.
- **Python-CLI**: sinnvoll, wenn Logik, Argumente, Statusprüfung und Moduswechsel klar strukturiert sein sollen.
- **Docker Compose**: startet lokale Infrastruktur wie Postgres, Redis oder andere Abhängigkeiten.
- **systemd**: nützlich für Host-Dienste auf einem einzelnen Rechner, aber kein Cluster-Orchestrator.

### Deployment / Runtime-Orchestrierung

- **Kubernetes**: startet, überwacht und skaliert laufende Services.
- **Helm**: paketiert Kubernetes-Deployments und Parameter pro Umgebung.
- **Kustomize**: overlay-basierte YAML-Varianten ohne Template-Engine.
- **Minikube**: lokale Kubernetes-Entwicklung.

### GitOps / Release-Steuerung

- **Argo CD**: gleicht Git-Zustand mit Cluster-Zustand ab.
- **Flux**: ähnliche GitOps-Richtung wie Argo CD.

### Infrastruktur

- **Terraform**: Cloud-Infrastruktur deklarativ provisionieren.
- **Pulumi**: Infrastruktur als Code mit einer Programmiersprache.
- **Crossplane**: Infrastruktur über Kubernetes-APIs verwalten.

### Workflows / Jobs / Hintergrundprozesse

- **Temporal**: langlebige, robuste Business-Workflows.
- **Airflow / Dagster / Prefect**: Daten- und Batch-Pipelines.
- **Celery / RQ**: klassische Background-Jobs, vor allem in Python.
- **Argo Workflows**: Kubernetes-native Job- und DAG-Orchestrierung.

## 2. Was diese Tools nicht gut ersetzen

| Tool | Gut für | Nicht gut für |
|---|---|---|
| Make / just / Task | kurze Dev-Kommandos | echte Deployment-Logik |
| Python-CLI | strukturierte Orchestrierung | Cluster-Ressourcenverwaltung allein |
| Docker Compose | lokale Abhängigkeiten | Produktion im Cluster |
| Kubernetes | Laufzeit, Skalierung, Self-Healing | einfache lokale Startreihenfolgen |
| Helm | App-Pakete auf K8s | imperative Arbeitsabläufe |
| Terraform | Infrastruktur | App-Workflows |
| Temporal | langlebige Prozesse | Infra-Provisioning |
| Celery / RQ | Hintergrundjobs | komplexe, zustandsbehaftete Workflows |

## 3. Was moderne Projekte oft kombinieren

Typische Kombinationen:

1. **Compose + Make/just/Task** für lokale Entwicklung
2. **Kubernetes + Helm** für Deployments
3. **Argo CD + Helm/Kustomize** für GitOps
4. **Terraform + Kubernetes** für Infrastruktur plus Applikation
5. **Temporal** für langlebige Geschäftsprozesse
6. **Celery/RQ** für einfache Python-Jobs

## 4. Empfehlung für IA3

Für IA3 passt derzeit am besten:

- **Docker Compose** für lokale Basisdienste
- **Python-CLI** als Orchestrierungs-Root für Start/Stop/Status
- **Make** nur als dünne Komfort-Schicht
- **Kubernetes + Helm** für Minikube und später Cloud
- **Temporal** erst dann, wenn wirklich langlebige, zustandsbehaftete Abläufe gebraucht werden

## 5. Faustregel

Wenn es um **Dienste, Ports, Startreihenfolge und Status** geht: Python-CLI + Make.

Wenn es um **Cluster, Rollouts und Self-Healing** geht: Kubernetes + Helm.

Wenn es um **mehrstufige Geschäftsprozesse** geht: Temporal.

Wenn es um **lokale Entwicklungsabhängigkeiten** geht: Docker Compose.

