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
app = typer.Typer(add_completion=False, help="IA3 SimWorld lifecycle CLI")


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
    Generate shell completion script for ia3ctl.
    
    Examples:
        # Bash
        ia3ctl completion --shell bash
        eval "$(ia3ctl completion --shell bash)"
    
        # Zsh
        ia3ctl completion --shell zsh
        eval "$(ia3ctl completion --shell zsh)"
    
        # Fish
        ia3ctl completion --shell fish
        ia3ctl completion --shell fish | source
    """
    shell_lower = shell.lower()
    
    if shell_lower == "bash":
        # Bash completion script
        script = """_ia3ctl_completion() {
    local cur prev opts
    COMPREPLY=()
    cur="${COMP_WORDS[COMP_CWORD]}"
    prev="${COMP_WORDS[COMP_CWORD-1]}"
    
    # Get all commands from help
    local commands="dev-lokal-start dev-lokal-stop dev-lokal-status dev-lokal-diagnose dev-lokal-build-status dev-lokal-clean-web-cache dev-mk-start dev-mk-stop dev-mk-status prod-mk-start prod-mk-stop prod-mk-status completion help"
    
    if [[ ${cur} == -* ]] ; then
        opts="--help"
        COMPREPLY=( $(compgen -W "${opts}" -- ${cur}) )
    else
        COMPREPLY=( $(compgen -W "${commands}" -- ${cur}) )
    fi
    return 0
}
complete -o default -F _ia3ctl_completion ia3ctl
"""
        typer.echo(script)
    
    elif shell_lower == "zsh":
        # Zsh completion
        script = """#compdef ia3ctl

_ia3ctl() {
  local -a commands=(
    'dev-lokal-start:Start local services'
    'dev-lokal-stop:Stop local services'
    'dev-lokal-status:Check local service status'
    'dev-lokal-diagnose:Diagnose local services'
    'dev-lokal-build-status:Check build status'
    'dev-lokal-clean-web-cache:Clean web cache'
    'dev-mk-start:Start Minikube services'
    'dev-mk-stop:Stop Minikube services'
    'dev-mk-status:Check Minikube status'
    'prod-mk-start:Start production Minikube'
    'prod-mk-stop:Stop production Minikube'
    'prod-mk-status:Check production status'
    'completion:Generate shell completion'
    'help:Show help'
  )
  
  _describe 'command' commands
}

_ia3ctl
"""
        typer.echo(script)
    
    elif shell_lower == "fish":
        # Fish completion
        script = """complete -c ia3ctl -f
complete -c ia3ctl -n "__fish_use_subcommand_from_list dev-lokal-start dev-lokal-stop dev-lokal-status dev-lokal-diagnose dev-lokal-build-status dev-lokal-clean-web-cache dev-mk-start dev-mk-stop dev-mk-status prod-mk-start prod-mk-stop prod-mk-status completion help" -a "dev-lokal-start" -d "Start local services"
complete -c ia3ctl -n "__fish_use_subcommand_from_list dev-lokal-start dev-lokal-stop dev-lokal-status dev-lokal-diagnose dev-lokal-build-status dev-lokal-clean-web-cache dev-mk-start dev-mk-stop dev-mk-status prod-mk-start prod-mk-stop prod-mk-status completion help" -a "dev-lokal-stop" -d "Stop local services"
complete -c ia3ctl -n "__fish_use_subcommand_from_list dev-lokal-start dev-lokal-stop dev-lokal-status dev-lokal-diagnose dev-lokal-build-status dev-lokal-clean-web-cache dev-mk-start dev-mk-stop dev-mk-status prod-mk-start prod-mk-stop prod-mk-status completion help" -a "dev-lokal-status" -d "Check local service status"
complete -c ia3ctl -n "__fish_use_subcommand_from_list dev-lokal-start dev-lokal-stop dev-lokal-status dev-lokal-diagnose dev-lokal-build-status dev-lokal-clean-web-cache dev-mk-start dev-mk-stop dev-mk-status prod-mk-start prod-mk-stop prod-mk-status completion help" -a "dev-lokal-diagnose" -d "Diagnose local services"
complete -c ia3ctl -n "__fish_use_subcommand_from_list dev-lokal-start dev-lokal-stop dev-lokal-status dev-lokal-diagnose dev-lokal-build-status dev-lokal-clean-web-cache dev-mk-start dev-mk-stop dev-mk-status prod-mk-start prod-mk-stop prod-mk-status completion help" -a "dev-lokal-build-status" -d "Check build status"
complete -c ia3ctl -n "__fish_use_subcommand_from_list dev-lokal-start dev-lokal-stop dev-lokal-status dev-lokal-diagnose dev-lokal-build-status dev-lokal-clean-web-cache dev-mk-start dev-mk-stop dev-mk-status prod-mk-start prod-mk-stop prod-mk-status completion help" -a "dev-lokal-clean-web-cache" -d "Clean web cache"
complete -c ia3ctl -n "__fish_use_subcommand_from_list dev-lokal-start dev-lokal-stop dev-lokal-status dev-lokal-diagnose dev-lokal-build-status dev-lokal-clean-web-cache dev-mk-start dev-mk-stop dev-mk-status prod-mk-start prod-mk-stop prod-mk-status completion help" -a "dev-mk-start" -d "Start Minikube services"
complete -c ia3ctl -n "__fish_use_subcommand_from_list dev-lokal-start dev-lokal-stop dev-lokal-status dev-lokal-diagnose dev-lokal-build-status dev-lokal-clean-web-cache dev-mk-start dev-mk-stop dev-mk-status prod-mk-start prod-mk-stop prod-mk-status completion help" -a "dev-mk-stop" -d "Stop Minikube services"
complete -c ia3ctl -n "__fish_use_subcommand_from_list dev-lokal-start dev-lokal-stop dev-lokal-status dev-lokal-diagnose dev-lokal-build-status dev-lokal-clean-web-cache dev-mk-start dev-mk-stop dev-mk-status prod-mk-start prod-mk-stop prod-mk-status completion help" -a "dev-mk-status" -d "Check Minikube status"
complete -c ia3ctl -n "__fish_use_subcommand_from_list dev-lokal-start dev-lokal-stop dev-lokal-status dev-lokal-diagnose dev-lokal-build-status dev-lokal-clean-web-cache dev-mk-start dev-mk-stop dev-mk-status prod-mk-start prod-mk-stop prod-mk-status completion help" -a "prod-mk-start" -d "Start production Minikube"
complete -c ia3ctl -n "__fish_use_subcommand_from_list dev-lokal-start dev-lokal-stop dev-lokal-status dev-lokal-diagnose dev-lokal-build-status dev-lokal-clean-web-cache dev-mk-start dev-mk-stop dev-mk-status prod-mk-start prod-mk-stop prod-mk-status completion help" -a "prod-mk-stop" -d "Stop production Minikube"
complete -c ia3ctl -n "__fish_use_subcommand_from_list dev-lokal-start dev-lokal-stop dev-lokal-status dev-lokal-diagnose dev-lokal-build-status dev-lokal-clean-web-cache dev-mk-start dev-mk-stop dev-mk-status prod-mk-start prod-mk-stop prod-mk-status completion help" -a "prod-mk-status" -d "Check production status"
complete -c ia3ctl -n "__fish_use_subcommand_from_list dev-lokal-start dev-lokal-stop dev-lokal-status dev-lokal-diagnose dev-lokal-build-status dev-lokal-clean-web-cache dev-mk-start dev-mk-stop dev-mk-status prod-mk-start prod-mk-stop prod-mk-status completion help" -a "completion" -d "Generate shell completion"
complete -c ia3ctl -n "__fish_use_subcommand_from_list dev-lokal-start dev-lokal-stop dev-lokal-status dev-lokal-diagnose dev-lokal-build-status dev-lokal-clean-web-cache dev-mk-start dev-mk-stop dev-mk-status prod-mk-start prod-mk-stop prod-mk-status completion help" -a "help" -d "Show help"
"""
        typer.echo(script)
    
    elif shell_lower == "powershell":
        # PowerShell completion
        script = """Register-ArgumentCompleter -CommandName ia3ctl -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)
    
    $commands = @(
        'dev-lokal-start',
        'dev-lokal-stop',
        'dev-lokal-status',
        'dev-lokal-diagnose',
        'dev-lokal-build-status',
        'dev-lokal-clean-web-cache',
        'dev-mk-start',
        'dev-mk-stop',
        'dev-mk-status',
        'prod-mk-start',
        'prod-mk-stop',
        'prod-mk-status',
        'completion',
        'help'
    )
    
    $commands | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
        [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
    }
}
"""
        typer.echo(script)
    
    else:
        typer.echo(f"Unknown shell: {shell}", err=True)
        raise typer.Exit(1)


@app.command("install-completion")
def install_completion_cmd(
    shell: str = typer.Option(
        None,
        "--shell",
        "-s",
        help="Shell type (bash, zsh, fish, powershell). Auto-detect if not provided.",
    )
) -> None:
    """
    Install shell completion permanently.
    
    Examples:
        ia3ctl install-completion --shell bash
        ia3ctl install-completion --shell zsh
    """
    import os
    import shlex
    
    # Auto-detect shell if not provided
    if not shell:
        current_shell = os.environ.get("SHELL", "").lower()
        if "bash" in current_shell:
            shell = "bash"
        elif "zsh" in current_shell:
            shell = "zsh"
        elif "fish" in current_shell:
            shell = "fish"
        elif "powershell" in current_shell or "pwsh" in current_shell:
            shell = "powershell"
        else:
            typer.echo("Could not detect shell. Use --shell to specify: bash, zsh, fish, or powershell", err=True)
            raise typer.Exit(1)
    
    shell = shell.lower()
    home = os.path.expanduser("~")
    
    if shell == "bash":
        profile_file = os.path.join(home, ".bashrc")
        completion_line = 'eval "$(ia3ctl completion --shell bash)"'
        typer.echo(f"Adding completion to {profile_file}...")
    elif shell == "zsh":
        profile_file = os.path.join(home, ".zshrc")
        completion_line = 'eval "$(ia3ctl completion --shell zsh)"'
        typer.echo(f"Adding completion to {profile_file}...")
    elif shell == "fish":
        profile_dir = os.path.join(home, ".config/fish/conf.d")
        profile_file = os.path.join(profile_dir, "ia3ctl.fish")
        os.makedirs(profile_dir, exist_ok=True)
        completion_line = "ia3ctl completion --shell fish | source"
        typer.echo(f"Creating {profile_file}...")
    elif shell == "powershell":
        typer.echo("PowerShell setup requires manual configuration. Run:")
        typer.echo('  ia3ctl completion --shell powershell | Out-String | Invoke-Expression')
        raise typer.Exit(0)
    else:
        typer.echo(f"Unknown shell: {shell}", err=True)
        raise typer.Exit(1)
    
    # Check if already installed
    if os.path.exists(profile_file):
        with open(profile_file, "r") as f:
            content = f.read()
            if "ia3ctl" in content:
                typer.echo("Completion already installed!", err=True)
                raise typer.Exit(0)
    
    # Add completion line
    with open(profile_file, "a") as f:
        f.write(f"\n# ia3ctl completion\n{completion_line}\n")
    
    typer.echo(f"✓ Completion installed for {shell}!")
    typer.echo(f"  Run: source {profile_file}")


def main(argv: list[str] | None = None) -> int:
    if argv is None:
        argv = sys.argv[1:]
    try:
        app(prog_name="ia3ctl", args=argv, standalone_mode=False)
        return 0
    except typer.Exit as exc:
        return int(exc.exit_code or 0)
