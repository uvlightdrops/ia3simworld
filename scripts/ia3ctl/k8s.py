"""Kubernetes and Helm utilities for ia3ctl."""

from __future__ import annotations

import subprocess
from pathlib import Path


def get_namespace(node: int, prod: bool = False) -> str:
    """Get k8s namespace for a given node.
    
    Dev: ia3-1, ia3-2, ia3-3
    Prod: ia3-prod-1, ia3-prod-2, etc.
    """
    prefix = "ia3-prod" if prod else "ia3"
    return f"{prefix}-{node}"


def get_helm_release(node: int, prod: bool = False) -> str:
    """Get Helm release name for a given node.
    
    Same as namespace for consistency.
    """
    return get_namespace(node, prod)


def get_chart_path() -> Path:
    """Get path to Helm chart."""
    root = Path(__file__).resolve().parents[2]
    return root / "deploy/helm/ia3-local"


def get_values_file() -> Path:
    """Get path to Helm values file."""
    root = Path(__file__).resolve().parents[2]
    return root / "deploy/helm/ia3-local/values-local.yaml"


def helm_cmd(cmd: list[str], check: bool = True) -> int:
    """Run a helm command."""
    return subprocess.run(cmd, check=check).returncode


def kubectl_cmd(cmd: list[str], check: bool = True) -> int:
    """Run a kubectl command."""
    return subprocess.run(cmd, check=check).returncode


def minikube_running() -> bool:
    """Check if minikube is running."""
    result = subprocess.run(["minikube", "status"], capture_output=True)
    return result.returncode == 0


def start_minikube() -> int:
    """Start minikube cluster."""
    return subprocess.run(
        ["minikube", "start", "--cpus=4", "--memory=8192"],
        check=False
    ).returncode


def helm_install(node: int, prod: bool = False) -> int:
    """Install or upgrade Helm release for a node."""
    ns = get_namespace(node, prod)
    release = get_helm_release(node, prod)
    chart = get_chart_path()
    values = get_values_file()
    
    # Ensure namespace exists
    ns_result = subprocess.run(
        ["kubectl", "create", "namespace", ns, "--dry-run=client", "-o", "yaml"],
        capture_output=True,
        check=False
    )
    if ns_result.returncode == 0:
        subprocess.run(
            ["kubectl", "apply", "-f", "-"],
            input=ns_result.stdout,
            check=False
        )
    
    # Clean up ingress webhook
    subprocess.run(
        ["kubectl", "delete", "validatingwebhookconfiguration",
         "ingress-nginx-admission", "--ignore-not-found"],
        check=False
    )
    
    # Install/upgrade Helm release
    return subprocess.run(
        ["helm", "upgrade", "--install", release, str(chart),
         "-n", ns, "-f", str(values)],
        check=False
    ).returncode


def helm_uninstall(node: int, prod: bool = False) -> int:
    """Uninstall Helm release for a node."""
    ns = get_namespace(node, prod)
    release = get_helm_release(node, prod)
    
    # Check if release exists
    check_result = subprocess.run(
        ["helm", "status", release, "-n", ns],
        capture_output=True,
        check=False
    )
    
    if check_result.returncode != 0:
        print(f"Release '{release}' in namespace '{ns}' not deployed.")
        return 0
    
    return subprocess.run(
        ["helm", "uninstall", release, "-n", ns],
        check=False
    ).returncode


def kubectl_delete_namespace(node: int, prod: bool = False) -> int:
    """Delete entire namespace for a node."""
    ns = get_namespace(node, prod)
    return subprocess.run(
        ["kubectl", "delete", "ns", ns, "--wait=false"],
        check=False
    ).returncode


def kubectl_get_pods(node: int, prod: bool = False) -> int:
    """Get pods in a namespace."""
    ns = get_namespace(node, prod)
    return subprocess.run(
        ["kubectl", "get", "pods", "-n", ns],
        check=False
    ).returncode


def kubectl_get_svc(node: int, prod: bool = False) -> int:
    """Get services in a namespace."""
    ns = get_namespace(node, prod)
    return subprocess.run(
        ["kubectl", "get", "svc", "-n", ns],
        check=False
    ).returncode


def kubectl_logs(node: int, deployment: str, prod: bool = False) -> int:
    """Get logs for a deployment."""
    ns = get_namespace(node, prod)
    return subprocess.run(
        ["kubectl", "logs", "-n", ns, f"deploy/{deployment}", "-f"],
        check=False
    ).returncode
