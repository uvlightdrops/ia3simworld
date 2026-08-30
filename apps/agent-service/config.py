"""
Configuration loader for agent-service

Loads configuration from:
1. Environment variables (highest priority): WORLD__TICK_RATE_MS
2. Stage override: config/stages/{STAGE}/config.yaml
3. Profile override: config/profiles/{PROFILE}.yaml
4. Defaults: config/defaults/*.yaml

Uses Pydantic v2 for type-safe validation
"""

import os
import yaml
from pathlib import Path
from typing import Optional
from pydantic import BaseModel, Field, validator


class OllamaConfig(BaseModel):
    enabled: bool = True
    base_url: str = "http://localhost:11434"
    model: str = "llama3.2:latest"
    timeout_ms: int = 8000


class AIConfig(BaseModel):
    auto_answer_mode: str = "manual"
    ollama: OllamaConfig = Field(default_factory=OllamaConfig)


class AgentConfig(BaseModel):
    grpc_addr: str = "localhost"
    grpc_port: int = 50051
    max_agents: int = 5


class PortsConfig(BaseModel):
    agent_service: str = "50051"
    world_sim: str = "17081"
    world_sim_url: str = "http://localhost:17081"
    api_gateway: str = "17080"
    web_client: str = "12000"


class NodeConfig(BaseModel):
    id: str = "ia3-1"
    master_url: Optional[str] = None
    own_url: Optional[str] = None
    assigned_sector_x: int = 0
    assigned_sector_y: int = 0


class WorldConfig(BaseModel):
    width: int = 2560
    height: int = 2560
    tick_rate_ms: int = 200
    lakes_density: float = 0.28
    berries_density: float = 0.25


class AppConfig(BaseModel):
    """Main application configuration"""
    ports: PortsConfig = Field(default_factory=PortsConfig)
    world: WorldConfig = Field(default_factory=WorldConfig)
    ai: AIConfig = Field(default_factory=AIConfig)
    node: NodeConfig = Field(default_factory=NodeConfig)
    agents: AgentConfig = Field(default_factory=AgentConfig)

    class Config:
        # Allow both snake_case and camelCase
        populate_by_name = True


def load_yaml_file(path: str) -> dict:
    """Load and parse YAML file, return empty dict if not found"""
    if not os.path.exists(path):
        return {}
    try:
        with open(path, 'r') as f:
            data = yaml.safe_load(f)
            return data or {}
    except Exception as e:
        print(f"[config] Warning: Failed to load {path}: {e}")
        return {}


def merge_configs(base: dict, override: dict) -> dict:
    """
    Deep merge override dict into base dict
    Override values take precedence
    """
    result = base.copy()
    for key, value in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = merge_configs(result[key], value)
        else:
            result[key] = value
    return result


def env_to_dict(prefix: str = "", separator: str = "__") -> dict:
    """
    Convert environment variables to nested dict
    
    Example:
        WORLD__TICK_RATE_MS=300 -> {"world": {"tick_rate_ms": "300"}}
        NODES__ID=ia3-2 -> {"node": {"id": "ia3-2"}}
    """
    result = {}
    for key, value in os.environ.items():
        # Only process variables with separator
        if separator not in key:
            continue
        
        # Split key into parts (e.g., WORLD__TICK_RATE_MS -> ["WORLD", "TICK_RATE_MS"])
        parts = key.split(separator)
        if len(parts) < 2:
            continue
        
        # Build nested structure
        current = result
        for part in parts[:-1]:
            part_lower = part.lower()
            if part_lower not in current:
                current[part_lower] = {}
            elif not isinstance(current[part_lower], dict):
                # Skip if key already exists as non-dict
                break
            current = current[part_lower]
        
        # Set final value
        final_key = parts[-1].lower()
        
        # Try to parse as int or bool
        val = value
        if value.lower() in ("true", "false"):
            val = value.lower() == "true"
        elif value.isdigit():
            val = int(value)
        elif value.replace(".", "", 1).isdigit():
            try:
                val = float(value)
            except ValueError:
                pass
        
        current[final_key] = val
    
    return result


def load_config() -> AppConfig:
    """
    Load configuration with priority:
    1. Defaults: config/defaults/*.yaml
    2. Profile: config/profiles/{PROFILE}.yaml
    3. Stage: config/stages/{STAGE}/config.yaml
    4. Environment variables: WORLD__*, NODE__*, etc.
    """
    
    config_base = Path(__file__).parent.parent.parent / "config"
    
    # Start with empty dict
    merged = {}
    
    # 1. Load defaults
    defaults_dir = config_base / "defaults"
    for yaml_file in ["ports.yaml", "world.yaml", "ai.yaml", "node.yaml"]:
        default_path = defaults_dir / yaml_file
        if default_path.exists():
            data = load_yaml_file(str(default_path))
            merged = merge_configs(merged, data)
    
    # 2. Load profile (if PROFILE env var set)
    profile = os.getenv("PROFILE")
    if profile:
        profile_path = config_base / "profiles" / f"{profile}.yaml"
        if profile_path.exists():
            data = load_yaml_file(str(profile_path))
            merged = merge_configs(merged, data)
            print(f"[config] Loaded profile: {profile}")
        else:
            print(f"[config] Warning: Profile {profile} not found at {profile_path}")
    
    # 3. Load stage (if STAGE env var set)
    stage = os.getenv("STAGE")
    if stage:
        stage_path = config_base / "stages" / stage / "config.yaml"
        if stage_path.exists():
            data = load_yaml_file(str(stage_path))
            merged = merge_configs(merged, data)
            print(f"[config] Loaded stage: {stage}")
        else:
            print(f"[config] Warning: Stage {stage} not found at {stage_path}")
    
    # 4. Load environment variables (highest priority)
    env_vars = env_to_dict()
    merged = merge_configs(merged, env_vars)
    
    # 5. Parse into AppConfig with Pydantic
    try:
        config = AppConfig(**merged)
        print(f"[config] Configuration loaded successfully")
        print(f"  - World: {config.world.width}x{config.world.height}")
        print(f"  - Tick Rate: {config.world.tick_rate_ms}ms")
        print(f"  - Node ID: {config.node.id}")
        print(f"  - Ollama: {config.ai.ollama.enabled}")
        return config
    except Exception as e:
        print(f"[config] Error parsing configuration: {e}")
        # Return defaults if parsing fails
        return AppConfig()


# Global config instance (lazy-loaded)
_config: Optional[AppConfig] = None


def get_config() -> AppConfig:
    """Get or load configuration (singleton-like)"""
    global _config
    if _config is None:
        _config = load_config()
    return _config


# Usage example:
if __name__ == "__main__":
    cfg = load_config()
    print("\nLoaded Configuration:")
    print(cfg.model_dump_json(indent=2))
