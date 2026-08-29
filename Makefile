SHELL := /bin/bash
NAMESPACE ?= ia3-1
HELM_RELEASE ?= ia3-1
CHART_PATH ?= deploy/helm/ia3-local
VALUES ?= deploy/helm/ia3-local/values-local.yaml

.PHONY: dev-mk-up dev-mk-down dev-mk-status-full logs nuke proto dev-mk-up-1 dev-mk-down-1 nuke-mk-1 dev-mk-up-2 dev-mk-down-2 nuke-mk-2 dev-mk-up-3 dev-mk-down-3 nuke-mk-3

dev-mk-up:
	minikube status >/dev/null 2>&1 || minikube start --cpus=4 --memory=8192
	kubectl delete validatingwebhookconfiguration ingress-nginx-admission --ignore-not-found || true
	kubectl create namespace $(NAMESPACE) --dry-run=client -o yaml | kubectl apply -f -
	helm upgrade --install $(HELM_RELEASE) $(CHART_PATH) -n $(NAMESPACE) -f $(VALUES)

dev-mk-down:
	@if helm status $(HELM_RELEASE) -n $(NAMESPACE) >/dev/null 2>&1; then \
		helm uninstall $(HELM_RELEASE) -n $(NAMESPACE); \
	else \
		echo "Release '$(HELM_RELEASE)' in namespace '$(NAMESPACE)' not deployed."; \
	fi

dev-mk-status-full:
	kubectl get pods -n $(NAMESPACE)
	kubectl get svc -n $(NAMESPACE)

logs:
	kubectl logs -n $(NAMESPACE) deploy/world-sim -f

nuke: dev-mk-down
	kubectl delete ns $(NAMESPACE) --wait=false || true

dev-mk-up-1:
	$(MAKE) dev-mk-up NAMESPACE=ia3-1 HELM_RELEASE=ia3-1

dev-mk-down-1:
	$(MAKE) dev-mk-down NAMESPACE=ia3-1 HELM_RELEASE=ia3-1

nuke-mk-1:
	$(MAKE) nuke NAMESPACE=ia3-1 HELM_RELEASE=ia3-1

dev-mk-up-2:
	$(MAKE) dev-mk-up NAMESPACE=ia3-2 HELM_RELEASE=ia3-2

dev-mk-down-2:
	$(MAKE) dev-mk-down NAMESPACE=ia3-2 HELM_RELEASE=ia3-2

nuke-mk-2:
	$(MAKE) nuke NAMESPACE=ia3-2 HELM_RELEASE=ia3-2

dev-mk-up-3:
	$(MAKE) dev-mk-up NAMESPACE=ia3-3 HELM_RELEASE=ia3-3

dev-mk-down-3:
	$(MAKE) dev-mk-down NAMESPACE=ia3-3 HELM_RELEASE=ia3-3

nuke-mk-3:
	$(MAKE) nuke NAMESPACE=ia3-3 HELM_RELEASE=ia3-3

proto:
	export PATH=$$HOME/go/bin:$$(go env GOPATH)/bin:$$PATH && \
	protoc --go_out=apps/world-sim --go-grpc_out=apps/world-sim --proto_path=packages/proto packages/proto/sim/v1/sim.proto
	source apps/agent-service/.venv/bin/activate && \
	python -m grpc_tools.protoc --proto_path=packages/proto --python_out=apps/agent-service --grpc_python_out=apps/agent-service packages/proto/sim/v1/sim.proto
