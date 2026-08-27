# IA3 SimWorld – AWS & Cloud Production Deployment Guide 🚀

Dieses Dokument beschreibt unsere Definitionen von **Development (Dev)** und **Production (Prod)** und bietet eine detaillierte, schrittweise Anleitung für das Deployment der IA3 SimWorld-Plattform auf **Amazon Web Services (AWS)** sowie kostengünstige Hosting-Alternativen.

---

## 1. Definition von Dev vs. Prod

Unser System trennt strikt zwischen lokaler Entwicklung, simulierter Produktion und echtem Cloud-Produktionsbetrieb:

| Dimension | Dev (Lokaler Host) | Prod-Sim (Lokaler K8s / Minikube) | True Prod (AWS Cloud) |
| :--- | :--- | :--- | :--- |
| **Zweck** | Schnelle Code-Iteration & Debugging | Testen von Multiplayer-Sharding & K8s-Kompatibilität | Live-Betrieb für echte Spieler & AR-Clients |
| **Laufzeit** | Nativer Host-Prozess (Go run, npm run dev, Python venv) | Containerisiert in Namespaces (`ia3`, `ia3-two`, `ia3-three`) | **Amazon EKS (Elastic Kubernetes Service)** oder Fargate |
| **Datenbanken** | Lokaler Docker-Compose (Postgres, Redis) | In-Cluster Helm-Deployments (Postgres, Redis) | **AWS RDS (PostgreSQL)** & **Amazon ElastiCache (Redis)** |
| **Netzwerk** | Direkte Ports (`:3000`, `:8080`, `:50051`) | Port-Forwarding von K8s (`13000`, `13001`, `13002`) | **AWS Application Load Balancer (ALB)** mit SSL (ACM) |
| **Updates** | Sofortiges Live-Reloading | `./scripts/prod/update.sh` (lokaler Image-Rebuild) | **CI/CD Pipeline** (GitHub Actions -> ECR -> EKS Rollout) |

---

## 2. AWS-Zielarchitektur für IA3 SimWorld

Da wir bereits eine hervorragende, voll-orchestrierte Kubernetes-Architektur via Helm haben, ist **AWS EKS (Elastic Kubernetes Service)** die absolut geeignetste und eleganteste Wahl. Dadurch können wir fast 100% unserer Helm-Charts und Multipod-Logiken unverändert wiederverwenden.

### AWS-Infrastruktur-Mapping:

```text
                  [ Internet: Spieler & AR-Clients ]
                                  │
                                  ▼
                 [ AWS Application Load Balancer (ALB) ]
                                  │
                ┌─────────────────┴─────────────────┐
                ▼ (Port 443 / HTTPs)                ▼ (Port 443 / WebSockets)
       [ web-client Pods ]                 [ api-gateway Pods ]
                │                                   │
                │ ◄────────── gRPC ───────────────► │
                │                                   ▼
                │                          [ world-sim Pods ]
                │                                   │
                │                                   ▼ (gRPC / Port 50051)
                │                          [ agent-service Pods ]
                │                                   │
                └─────────────────┬─────────────────┘
                                  ▼ (VPC Private Subnet)
         ┌────────────────────────┴────────────────────────┐
         ▼                                                 ▼
  [ AWS RDS (PostgreSQL) ]                    [ Amazon ElastiCache (Redis) ]
```

---

## 3. Schritt-für-Schritt AWS-Deployment-Anleitung

### Schritt 1: Container-Registries in AWS ECR anlegen
Erstelle für jeden unserer vier Services ein privates Repository in **Amazon Elastic Container Registry (ECR)**:
```bash
aws ecr create-repository --repository-name ia3/web-client
aws ecr create-repository --repository-name ia3/api-gateway
aws ecr create-repository --repository-name ia3/world-sim
aws ecr create-repository --repository-name ia3/agent-service
```
Bilde die Docker-Images lokal und pushe sie in deine AWS-Registries:
```bash
# Beispiel für den api-gateway
aws ecr get-login-password --region eu-central-1 | docker login --username AWS --password-stdin YOUR_AWS_ACCOUNT_ID.dkr.ecr.eu-central-1.amazonaws.com

docker build -t YOUR_AWS_ACCOUNT_ID.dkr.ecr.eu-central-1.amazonaws.com/ia3/api-gateway:latest -f apps/api-gateway/Dockerfile .
docker push YOUR_AWS_ACCOUNT_ID.dkr.ecr.eu-central-1.amazonaws.com/ia3/api-gateway:latest
```

### Schritt 2: EKS-Kubernetes-Cluster aufsetzen (mittels `eksctl`)
Der einfachste Weg, einen verwalteten Kubernetes-Cluster auf AWS zu erstellen, ist das offizielle CLI-Tool `eksctl`:
```bash
eksctl create cluster \
  --name ia3-production-cluster \
  --region eu-central-1 \
  --nodegroup-name standard-workers \
  --node-type t3.medium \
  --nodes 3 \
  --nodes-min 1 \
  --nodes-max 4 \
  --managed
```

### Schritt 3: Cloud-Datenbanken (RDS & ElastiCache) erstellen
Für echte Produktion lagern wir PostgreSQL und Redis aus dem K8s-Cluster aus, um maximale Ausfallsicherheit zu gewährleisten:
1. **AWS RDS PostgreSQL Instance:** Erstelle eine PostgreSQL-Datenbank (z.B. `db.t3.micro` oder `db.t3.small`) in den privaten Subnetzen deiner EKS-VPC.
2. **Amazon ElastiCache Redis:** Erstelle einen Redis-Cluster in derselben VPC und konfiguriere die Security Groups so, dass deine EKS-Worker-Nodes Zugriff haben.

### Schritt 4: Helm-Produktionskonfiguration vorbereiten
Erstelle eine neue Helm-Value-Datei `deploy/helm/ia3-local/values-prod.yaml` für den Cloud-Betrieb:
```yaml
# deploy/helm/ia3-local/values-prod.yaml
global:
  environment: production

# Deaktivieren der In-Cluster-Datenbanken, da wir AWS RDS & ElastiCache nutzen
postgresql:
  enabled: false
redis:
  enabled: false

# Externe AWS-Verbindungsdaten einspeisen
externalDatabase:
  host: "ia3-db-instance.xxxxxx.eu-central-1.rds.amazonaws.com"
  port: 5432
  user: "ia3_admin"
  password: "YOUR_RDS_SECURE_PASSWORD"
  database: "ia3_world"

externalRedis:
  host: "ia3-redis.xxxxxx.clustercfg.eu-central-1.cache.amazonaws.com"
  port: 6379

# Produktions-Images von AWS ECR referenzieren
web-client:
  image:
    repository: "YOUR_AWS_ACCOUNT_ID.dkr.ecr.eu-central-1.amazonaws.com/ia3/web-client"
    tag: "latest"
  replicaCount: 2

api-gateway:
  image:
    repository: "YOUR_AWS_ACCOUNT_ID.dkr.ecr.eu-central-1.amazonaws.com/ia3/api-gateway"
    tag: "latest"
  replicaCount: 2

world-sim:
  image:
    repository: "YOUR_AWS_ACCOUNT_ID.dkr.ecr.eu-central-1.amazonaws.com/ia3/world-sim"
    tag: "latest"

agent-service:
  image:
    repository: "YOUR_AWS_ACCOUNT_ID.dkr.ecr.eu-central-1.amazonaws.com/ia3/agent-service"
    tag: "latest"
```

### Schritt 5: Deployen via Helm auf AWS EKS!
Verbinde dein lokales `kubectl` mit deinem neuen AWS-Cluster und führe die Installation aus:
```bash
aws eks update-kubeconfig --region eu-central-1 --name ia3-production-cluster

# Namespace erstellen
kubectl create namespace ia3

# Helm Chart mit Produktions-Konfiguration deployen
helm upgrade --install ia3 deploy/helm/ia3-local -f deploy/helm/ia3-local/values-prod.yaml -n ia3
```

---

## 4. Kostengünstige Alternativen zu AWS (Sehr Empfohlen für MVPs!)

AWS EKS ist extrem mächtig und hochverfügbar, erzeugt jedoch bereits im Leerlauf signifikante Grundkosten (ca. **120$ - 180$ / Monat** für den EKS-Control-Plane und t3-Instanzen). 

Für den aktuellen Reifegrad unseres MVPs sind folgende Alternativen aus kaufmännischer und technischer Sicht **deutlich besser geeignet**:

### Option A: DigitalOcean Managed Kubernetes (DOKS)
- **Vorteil:** Die Control Plane ist ab 3 Worker-Nodes komplett **kostenlos**!
- **Kosten:** Ca. **24$ - 36$ / Monat** insgesamt.
- **Setup:** Du erhältst einen echten, extrem einfach bedienbaren Kubernetes-Cluster mit Managed PostgreSQL und Redis. Deine bestehenden Helm-Charts laufen dort 1:1 identisch.

### Option B: Hetzner Cloud (K3s auf Debian)
- **Vorteil:** Unschlagbares Preis-Leistungs-Verhältnis für Rechenleistung in Deutschland.
- **Kosten:** Ca. **15$ - 25$ / Monat** insgesamt.
- **Setup:** Wir mieten uns 1-2 Cloud-Instanzen (CX21/CX31) und installieren ein leichtgewichtiges Kubernetes (`K3s`) via Rancher. Du kannst dort direkt via Helm deployen.

---

## 5. Unser gemeinsamer Vorgehensplan
Falls du dich für ein Cloud-Deployment entscheidest, unterstütze ich dich gerne bei jedem Schritt:
1. **Entscheidung treffen:** Möchtest du direkt auf **AWS EKS** (für Enterprise-Skalierung) oder starten wir kostengünstiger auf **DigitalOcean / Hetzner**?
2. **Registry-Setup:** Ich erstelle dir die Scripte zum automatischen Bauen und Hochladen der Docker-Images.
3. **Produktions-Helm-Chart:** Ich konfiguriere dir die `values-prod.yaml` passgenau für deinen ausgewählten Provider.
