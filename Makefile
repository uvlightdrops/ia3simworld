SHELL := /bin/bash

.PHONY: proto

proto:
	export PATH=$$HOME/go/bin:$$(go env GOPATH)/bin:$$PATH && \
	protoc --go_out=apps/world-sim --go-grpc_out=apps/world-sim --proto_path=packages/proto packages/proto/sim/v1/sim.proto
	source apps/agent-service/.venv/bin/activate && \
	python -m grpc_tools.protoc --proto_path=packages/proto --python_out=apps/agent-service --grpc_python_out=apps/agent-service packages/proto/sim/v1/sim.proto

