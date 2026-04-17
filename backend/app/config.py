"""Configuration loader for TriMind Agent."""

import os
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, Field


class ServerConfig(BaseModel):
    host: str = "0.0.0.0"
    port: int = 8000
    frontend_port: int = 5173


class OllamaConfig(BaseModel):
    base_url: str = "http://localhost:11434"


class ModelsConfig(BaseModel):
    planner: str = "deepseek-r1:14b"
    executor: str = "qwen2.5-coder:14b"
    reviewer: str = "llama3.1:8b"


class AgentConfig(BaseModel):
    max_iterations: int = 20
    auto_test: bool = True
    temperature: float = 0.7
    max_tokens: int = 4096


class MemoryConfig(BaseModel):
    enabled: bool = True
    db_path: str = "./data/memory.db"
    max_context_messages: int = 50


class ShellConfig(BaseModel):
    enabled: bool = True
    timeout: int = 30
    allowed_commands: list[str] = Field(default_factory=list)


class BrowserConfig(BaseModel):
    enabled: bool = True
    timeout: int = 15


class FileManagerConfig(BaseModel):
    enabled: bool = True
    workspace: str = "./workspace"


class ToolsConfig(BaseModel):
    shell: ShellConfig = Field(default_factory=ShellConfig)
    browser: BrowserConfig = Field(default_factory=BrowserConfig)
    file_manager: FileManagerConfig = Field(default_factory=FileManagerConfig)


class LoggingConfig(BaseModel):
    level: str = "INFO"
    file: str = "./data/trimind.log"


class AppConfig(BaseModel):
    server: ServerConfig = Field(default_factory=ServerConfig)
    ollama: OllamaConfig = Field(default_factory=OllamaConfig)
    models: ModelsConfig = Field(default_factory=ModelsConfig)
    agent: AgentConfig = Field(default_factory=AgentConfig)
    memory: MemoryConfig = Field(default_factory=MemoryConfig)
    tools: ToolsConfig = Field(default_factory=ToolsConfig)
    logging: LoggingConfig = Field(default_factory=LoggingConfig)


_config: AppConfig | None = None


def load_config(config_path: str | None = None) -> AppConfig:
    """Load configuration from YAML file."""
    global _config

    if config_path is None:
        config_path = os.environ.get(
            "TRIMIND_CONFIG",
            str(Path(__file__).parent.parent.parent.parent / "config.yaml"),
        )

    path = Path(config_path)
    if path.exists():
        with open(path) as f:
            raw: dict[str, Any] = yaml.safe_load(f) or {}
        _config = AppConfig(**raw)
    else:
        _config = AppConfig()

    return _config


def get_config() -> AppConfig:
    """Get the current configuration. Loads defaults if not yet loaded."""
    global _config
    if _config is None:
        return load_config()
    return _config
