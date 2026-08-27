SHELL := /bin/bash
NAMESPACE ?= ia3
HELM_RELEASE ?= ia3-local
CHART_PATH ?= deploy/helm/ia3-local
VALUES ?= deploy/helm/ia3-local/values-local.yaml

.PHONY: dev-up dev-down dev-status port-forward port-forward-status logs nuke proto dev-up-two dev-down-two nuke-two dev-up-three dev-down-three nuke-three dev-start dev-stop dev-diagnose prod-start prod-stop prod-diagnose prod-update prod-update-web prod-update-sim prod-update-gateway prod-update-agent

# Direct Local Development Services (Non-Kubernetes)
dev-start:
	./scripts/dev/start.sh

dev-stop:
	./scripts/dev/stop.sh

dev-diagnose:
	./scripts/dev/diagnose.sh

# Kubernetes Deployment via Minikube
prod-start:
	./scripts/prod/start.sh

prod-stop:
	./scripts/prod/stop.sh

prod-diagnose:
	./scripts/prod/diagnose.sh

prod-update:
	./scripts/prod/update.sh all

prod-update-web:
	./scripts/prod/update.sh web-client

prod-update-sim:
	./scripts/prod/update.sh world-sim

prod-update-gateway:
	./scripts/prod/update.sh api-gateway

prod-update-agent:
	./scripts/prod/update.sh agent-service

dev-up:
	minikube start --cpus=4 --memory=8192
	kubectl create namespace $(NAMESPACE) --dry-run=client -o yaml | kubectl apply -f -
	helm upgrade --install $(HELM_RELEASE) $(CHART_PATH) -n $(NAMESPACE) -f $(VALUES)

dev-down:
	helm uninstall $(HELM_RELEASE) -n $(NAMESPACE) || true

dev-status:
	kubectl get pods -n $(NAMESPACE)
	kubectl get svc -n $(NAMESPACE)

port-forward:
	./scripts/prod/port-forward-k8s.sh

port-forward-status:
	./scripts/prod/port-forward-status.sh

logs:
	kubectl logs -n $(NAMESPACE) deploy/world-sim -f

nuke: dev-down
	kubectl delete ns $(NAMESPACE) --wait=false || true

dev-up-two:
	$(MAKE) dev-up NAMESPACE=ia3-two HELM_RELEASE=ia3-two

dev-down-two:
	$(MAKE) dev-down NAMESPACE=ia3-two HELM_RELEASE=ia3-two

nuke-two:
	$(MAKE) nuke NAMESPACE=ia3-two HELM_RELEASE=ia3-two

dev-up-three:
	$(MAKE) dev-up NAMESPACE=ia3-three HELM_RELEASE=ia3-three

dev-down-three:
	$(MAKE) dev-down NAMESPACE=ia3-three HELM_RELEASE=ia3-three

nuke-three:
	$(MAKE) nuke NAMESPACE=ia3-three HELM_RELEASE=ia3-three

proto:
	export PATH=$$HOME/go/bin:$$(go env GOPATH)/bin:$$PATH && \
	protoc --go_out=apps/world-sim --go-grpc_out=apps/world-sim --proto_path=packages/proto packages/proto/sim/v1/sim.proto
	source apps/agent-service/.venv/bin/activate && \
	python -m grpc_tools.protoc --proto_path=packages/proto --python_out=apps/agent-service --grpc_python_out=apps/agent-service packages/proto/sim/v1/sim.proto
