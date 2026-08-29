"""Shared lifecycle CLI implementation."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

import typer

from .nodes import parse_nodes
from .ports import local_ports, mk_ports
from .status import report_local, report_local_build, report_mk
from .system import is_endpoint_healthy, is_port_in_use


ROOT = Path(__file__).resolve().parents[2]
VERBOSE_START = True
app = typer.Typer(add_completion=True, help="IA3 SimWorld lifecycle CLI")


def parse_services(raw: str | None) -> list[str]:
    if not raw:
        return ["web", "api", "sim", "agent"]
    services = [s.strip() for s in raw.split(",") if s.strip()]
    allowed = {"web", "api", "sim", "agent"}
    for service in services:
        if service not in allowed:
            raise ValueError(f"unknown service: {service}")
    return services


def parse_services_single(raw: str | None) -> list[str]:
    services = parse_services(raw)
    if len(services) != 1:
        return services
    return services


def run(cmd: list[str], cwd: Path | None = None, env: dict[str, str] | None = None) -> int:
    return subprocess.run(cmd, cwd=cwd or ROOT, env=env, check=False).returncode


def cleanup_web_cache() -> bool:
    removed = False
    next_dir = ROOT / "apps/web-client/.next"
    cache_dir = ROOT / "apps/web-client/node_modules/.cache"
    if next_dir.exists():
        shutil.rmtree(next_dir)
        removed = True
    if cache_dir.exists():
        shutil.rmtree(cache_dir)
        removed = True
    return removed


def tail_log(path: Path, lines: int = 20) -> str:
    if not path.exists():
        return ""
    content = path.read_text(errors="ignore").splitlines()
    return "\n".join(content[-lines:])


def report_start_line(message: str) -> None:
    if VERBOSE_START:
        print(message, file=sys.stderr, flush=True)


def python_for_agent() -> list[str]:
    venv_python = ROOT / "apps/agent-service/.venv/bin/python"
    if venv_python.exists():
        return [str(venv_python)]
    return [sys.executable]


def requested(services: list[str], service: str) -> bool:
    return service in services


def start_agent(node: int, ports, env: dict[str, str], started_ports: list[str]) -> int:
    if is_port_in_use(ports.agent):
        report_start_line(f"   agent: OK :{ports.agent} (already running)")
        return 0
    env["PORT"] = str(ports.agent)
    env["PYTHONUNBUFFERED"] = "1"
    agent_py = python_for_agent()
    log = ROOT / ".tmp" / f"agent-service-{node}.log"
    report_start_line(f"   agent: spawn {' '.join(agent_py + ['main.py'])} -> :{ports.agent}")
    subprocess.Popen(
        agent_py + ["main.py"],
        cwd=ROOT / "apps/agent-service",
        env=env,
        stdout=log.open("a"),
        stderr=subprocess.STDOUT,
    )
    time.sleep(2)
    if not is_port_in_use(ports.agent):
        report_start_line(f"   agent: -- failed to bind :{ports.agent}")
        tail = tail_log(log)
        if tail:
            print(tail, file=sys.stderr, flush=True)
        return 1
    report_start_line(f"   agent: OK :{ports.agent}")
    started_ports.append(f"node {node} agent :{ports.agent}")
    return 0


def start_sim(node: int, ports, env: dict[str, str], started_ports: list[str]) -> int:
    if is_port_in_use(ports.sim):
        report_start_line(f"   sim:   OK :{ports.sim} (already running)")
        return 0
    report_start_line(f"   sim:   depends on agent port :{ports.agent}")
    env["PORT"] = str(ports.sim)
    env["AGENT_GRPC_ADDR"] = f"localhost:{ports.agent}"
    env["PYTHONUNBUFFERED"] = "1"
    log = ROOT / ".tmp" / f"world-sim-{node}.log"
    report_start_line(f"   sim:   spawn go run . -> :{ports.sim} (AGENT_GRPC_ADDR={env['AGENT_GRPC_ADDR']})")
    subprocess.Popen(
        ["go", "run", "."],
        cwd=ROOT / "apps/world-sim",
        env=env,
        stdout=log.open("a"),
        stderr=subprocess.STDOUT,
    )
    time.sleep(2)
    if not is_port_in_use(ports.sim):
        report_start_line(f"   sim:   -- failed to bind :{ports.sim}")
        tail = tail_log(log)
        if tail:
            print(tail, file=sys.stderr, flush=True)
        return 1
    report_start_line(f"   sim:   OK :{ports.sim}")
    started_ports.append(f"node {node} sim :{ports.sim}")
    return 0


def start_api(node: int, ports, env: dict[str, str], started_ports: list[str]) -> int:
    if is_port_in_use(ports.api):
        report_start_line(f"   api:   OK :{ports.api} (already running)")
        return 0
    report_start_line(f"   api:   depends on sim port :{ports.sim}")
    env["PORT"] = str(ports.api)
    env["WORLD_SIM_URL"] = f"http://localhost:{ports.sim}"
    env["PYTHONUNBUFFERED"] = "1"
    log = ROOT / ".tmp" / f"api-gateway-{node}.log"
    report_start_line(f"   api:   spawn go run . -> :{ports.api} (WORLD_SIM_URL={env['WORLD_SIM_URL']})")
    subprocess.Popen(
        ["go", "run", "."],
        cwd=ROOT / "apps/api-gateway",
        env=env,
        stdout=log.open("a"),
        stderr=subprocess.STDOUT,
    )
    time.sleep(2)
    if not is_port_in_use(ports.api):
        report_start_line(f"   api:   -- failed to bind :{ports.api}")
        tail = tail_log(log)
        if tail:
            print(tail, file=sys.stderr, flush=True)
        return 1
    report_start_line(f"   api:   OK :{ports.api}")
    started_ports.append(f"node {node} api :{ports.api}")
    return 0


def start_web(node: int, ports, env: dict[str, str], started_ports: list[str], cleaned_web_cache: bool) -> tuple[int, bool]:
    if is_port_in_use(ports.web):
        report_start_line(f"   web:   OK :{ports.web} (already running)")
        return 0, cleaned_web_cache
    report_start_line(f"   web:   depends on api port :{ports.api}")
    env["NEXT_PUBLIC_API_BASE"] = f"http://localhost:{ports.api}"
    env["CI"] = "1"
    log = ROOT / ".tmp" / f"web-client-{node}.log"
    cleaned_web_cache = cleanup_web_cache() or cleaned_web_cache
    web_cmd = ["./node_modules/.bin/next", "dev", "-p", str(ports.web), "--hostname", "0.0.0.0"]
    report_start_line(f"   web:   spawn {' '.join(web_cmd)} -> :{ports.web} (NEXT_PUBLIC_API_BASE={env['NEXT_PUBLIC_API_BASE']})")
    subprocess.Popen(
        web_cmd,
        cwd=ROOT / "apps/web-client",
        env={**env, "PORT": str(ports.web)},
        stdout=log.open("a"),
        stderr=subprocess.STDOUT,
    )
    time.sleep(3)
    if not is_port_in_use(ports.web):
        report_start_line(f"   web:   -- failed to bind :{ports.web}")
        tail = tail_log(log)
        if tail:
            print(tail, file=sys.stderr, flush=True)
        return 1, cleaned_web_cache
    report_start_line(f"   web:   OK :{ports.web}")
    started_ports.append(f"node {node} web :{ports.web}")
    return 0, cleaned_web_cache


def start_local(nodes: list[int], services: list[str]) -> int:
    cleaned_web_cache = False
    started_ports: list[str] = []
    for node in nodes:
        ports = local_ports(node)
        env = os.environ.copy()
        env["NODE_NAME"] = f"ia3-{node}"
        report_start_line(f"node {node}")
        report_start_line(f"   ports: web={ports.web} api={ports.api} sim={ports.sim} agent={ports.agent}")
        want_agent = requested(services, "agent") or requested(services, "sim") or requested(services, "api") or requested(services, "web")
        want_sim = requested(services, "sim") or requested(services, "api") or requested(services, "web")
        want_api = requested(services, "api") or requested(services, "web")
        want_web = requested(services, "web")

        if want_agent:
            rc = start_agent(node, ports, env, started_ports)
            if rc != 0:
                return rc
        if want_sim:
            rc = start_sim(node, ports, env, started_ports)
            if rc != 0:
                return rc
        if want_api:
            rc = start_api(node, ports, env, started_ports)
            if rc != 0:
                return rc
        if want_web:
            rc, cleaned_web_cache = start_web(node, ports, env, started_ports, cleaned_web_cache)
            if rc != 0:
                return rc
        time.sleep(0.2)
    if cleaned_web_cache:
        report_start_line("web cache: cleaned stale Next.js cache before start")
    if started_ports:
        report_start_line("started:")
        for line in started_ports:
            report_start_line(f"   {line}")
    return 0


def stop_local(nodes: list[int], services: list[str]) -> int:
    port_args: list[int] = []
    for node in nodes:
        p = local_ports(node)
        if "web" in services:
            port_args.append(p.web)
        if "api" in services:
            port_args.append(p.api)
        if "sim" in services:
            port_args.append(p.sim)
        if "agent" in services:
            port_args.append(p.agent)
    if not port_args:
        return 0
    seen: set[int] = set()
    killed = False
    for port in port_args:
        print(f"scan port {port}")
        res = subprocess.run(
            ["bash", "-lc", f"ss -lntup 2>/dev/null | grep -F ':{port}' | sed -nE 's/.*pid=([0-9]+).*/\\1/p' | sort -u"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        for line in res.stdout.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                pid = int(line)
            except ValueError:
                continue
            if pid in seen:
                continue
            seen.add(pid)
            killed = True
            print(f"stop pid={pid} port={port}")
            subprocess.run(["kill", str(pid)], check=False)
        if res.stdout.strip() == "":
            print(f"no pid found for port={port}")
    return 0 if killed else 0


def start_mk(nodes: list[int], services: list[str], prod: bool) -> int:
    env = os.environ.copy()
    env["NODES"] = str(max(nodes))
    target = "prod-start" if prod else "dev-up"
    return run(["make", target, f"NODES={max(nodes)}"], cwd=ROOT, env=env)


def stop_mk(nodes: list[int], services: list[str], prod: bool) -> int:
    env = os.environ.copy()
    env["NODES"] = str(max(nodes))
    target = "prod-stop" if prod else "dev-down"
    return run(["make", target, f"NODES={max(nodes)}"], cwd=ROOT, env=env)


def status_local(nodes: list[int]) -> int:
    print(report_local(nodes))
    return 0


def diagnose_local(nodes: list[int]) -> int:
    lines = [report_local_build(nodes), report_local(nodes)]
    print("\n".join(lines))
    return 0


def status_mk(nodes: list[int]) -> int:
    print(report_mk(nodes))
    return 0


@app.command("dev-lokal-start")
def dev_lokal_start(
    nodes: str = typer.Argument("1,2,3", help="Node list, e.g. 1,2 or [1,2]"),
    services: str = typer.Option("web,api,sim,agent", help="Comma-separated services"),
) -> None:
    node_list = parse_nodes(nodes)
    service_list = parse_services(services)
    rc = start_local(node_list, service_list)
    if rc == 0:
        print("\n".join([f"node {n}: web={local_ports(n).web}, api={local_ports(n).api}, sim={local_ports(n).sim}, agent={local_ports(n).agent}" for n in node_list]))
        raise typer.Exit(0)
    raise typer.Exit(rc)


@app.command("dev-lokal-stop")
def dev_lokal_stop(
    nodes: str = typer.Argument("1,2,3", help="Node list, e.g. 1,2 or [1,2]"),
    services: str = typer.Option("web,api,sim,agent", help="Comma-separated services"),
) -> None:
    raise typer.Exit(stop_local(parse_nodes(nodes), parse_services(services)))


@app.command("dev-lokal-status")
def dev_lokal_status(nodes: str = typer.Argument("1,2,3", help="Node list, e.g. 1,2 or [1,2]")) -> None:
    raise typer.Exit(status_local(parse_nodes(nodes)))


@app.command("dev-lokal-diagnose")
def dev_lokal_diagnose(nodes: str = typer.Argument("1,2,3", help="Node list, e.g. 1,2 or [1,2]")) -> None:
    raise typer.Exit(diagnose_local(parse_nodes(nodes)))


@app.command("dev-lokal-build-status")
def dev_lokal_build_status(nodes: str = typer.Argument("1,2,3", help="Node list, e.g. 1,2 or [1,2]")) -> None:
    print(report_local_build(parse_nodes(nodes)))
    raise typer.Exit(0)


@app.command("dev-lokal-clean-web-cache")
def dev_lokal_clean_web_cache() -> None:
    print("cleaned" if cleanup_web_cache() else "already clean")
    raise typer.Exit(0)


@app.command("dev-mk-start")
def dev_mk_start(
    nodes: str = typer.Argument("1,2,3", help="Node list, e.g. 1,2 or [1,2]"),
    services: str = typer.Option("web,api,sim,agent", help="Comma-separated services"),
) -> None:
    raise typer.Exit(start_mk(parse_nodes(nodes), parse_services(services), prod=False))


@app.command("dev-mk-stop")
def dev_mk_stop(
    nodes: str = typer.Argument("1,2,3", help="Node list, e.g. 1,2 or [1,2]"),
    services: str = typer.Option("web,api,sim,agent", help="Comma-separated services"),
) -> None:
    raise typer.Exit(stop_mk(parse_nodes(nodes), parse_services(services), prod=False))


@app.command("dev-mk-status")
def dev_mk_status(nodes: str = typer.Argument("1,2,3", help="Node list, e.g. 1,2 or [1,2]")) -> None:
    raise typer.Exit(status_mk(parse_nodes(nodes)))


@app.command("prod-mk-start")
def prod_mk_start(
    nodes: str = typer.Argument("1,2,3", help="Node list, e.g. 1,2 or [1,2]"),
    services: str = typer.Option("web,api,sim,agent", help="Comma-separated services"),
) -> None:
    raise typer.Exit(start_mk(parse_nodes(nodes), parse_services(services), prod=True))


@app.command("prod-mk-stop")
def prod_mk_stop(
    nodes: str = typer.Argument("1,2,3", help="Node list, e.g. 1,2 or [1,2]"),
    services: str = typer.Option("web,api,sim,agent", help="Comma-separated services"),
) -> None:
    raise typer.Exit(stop_mk(parse_nodes(nodes), parse_services(services), prod=True))


@app.command("prod-mk-status")
def prod_mk_status(nodes: str = typer.Argument("1,2,3", help="Node list, e.g. 1,2 or [1,2]")) -> None:
    raise typer.Exit(status_mk(parse_nodes(nodes)))


@app.command("completion")
def completion(
    shell: str = typer.Option(
        "bash",
        "--shell",
        "-s",
        help="Shell type (bash, zsh, fish, powershell)",
    )
) -> None:
    """
    Install or show completion for ia3ctl.
    
    Bash:
        ia3ctl completion --shell bash
        eval "$(_IA3CTL_COMPLETE=bash_source ia3ctl)"
    
    Zsh:
        ia3ctl completion --shell zsh
        eval "$(_IA3CTL_COMPLETE=zsh_source ia3ctl)"
    
    Fish:
        ia3ctl completion --shell fish
        ia3ctl completion --shell fish | source
    
    PowerShell:
        Set-PSReadlineKeyHandler -Key Tab -Function MenuComplete
        $IA3CTL_COMPLETE = "powershell_source"
        ia3ctl completion --shell powershell | Out-String | Invoke-Expression
    """
    from enum import Enum
    
    class Shell(str, Enum):
        BASH = "bash"
        ZSH = "zsh"
        FISH = "fish"
        POWERSHELL = "powershell"
    
    shell_map = {
        Shell.BASH: "_IA3CTL_COMPLETE=bash_source",
        Shell.ZSH: "_IA3CTL_COMPLETE=zsh_source",
        Shell.FISH: "_IA3CTL_COMPLETE=fish_source",
        Shell.POWERSHELL: "_IA3CTL_COMPLETE=powershell_source",
    }
    
    if shell not in shell_map:
        typer.echo(f"Unknown shell: {shell}", err=True)
        raise typer.Exit(1)
    
    env_var = shell_map[shell]
    if shell == "fish":
        typer.echo(f"\n# Add this to your fish config (~/.config/fish/config.fish):")
        typer.echo(f"eval (env {env_var} ia3ctl)\n")
    elif shell == "powershell":
        typer.echo(f"\n# Add this to your PowerShell profile (Get-Profile):")
        typer.echo(f"$env:{env_var} = 'powershell_source'; ia3ctl completion --shell powershell | Out-String | Invoke-Expression\n")
    else:
        typer.echo(f"\n# Add this to your shell profile (~/.bashrc, ~/.zshrc, etc.):")
        typer.echo(f'eval "$({env_var} ia3ctl)"\n')


@app.command("--install-completion", hidden=True)
def install_completion_wrapper() -> None:
    """Install shell completion."""
    typer.echo("Use: eval \"$(_IA3CTL_COMPLETE=bash_source ia3ctl)\"")
    typer.echo("     or ia3ctl completion --shell <bash|zsh|fish|powershell>")
    raise typer.Exit(0)


def main(argv: list[str] | None = None) -> int:
    if argv is None:
        argv = sys.argv[1:]
    try:
        app(prog_name="ia3ctl", args=argv, standalone_mode=False)
        return 0
    except typer.Exit as exc:
        return int(exc.exit_code or 0)
