SHELL := /bin/bash
NAMESPACE ?= ia3
HELM_RELEASE ?= ia3-local
CHART_PATH ?= deploy/helm/ia3-local
VALUES ?= deploy/helm/ia3-local/values-local.yaml

.PHONY: dev-up dev-down dev-status port-forward port-forward-status logs nuke proto dev-up-two dev-down-two nuke-two

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
	./scripts/dev/port-forward-k8s.sh

port-forward-status:
	./scripts/dev/port-forward-status.sh

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
