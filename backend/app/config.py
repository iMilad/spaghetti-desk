from __future__ import annotations

import os
from collections.abc import Mapping
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

from app.models import AppConfig


def _project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _default_config_path() -> Path:
    return _project_root() / "config" / "config.example.yaml"


def _configured_config_path() -> Path:
    return Path(os.getenv("SPAGHETTI_CONFIG_PATH", _default_config_path()))


def _read_yaml(path: Path) -> dict[str, Any]:
    payload = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"config file {path} must contain a mapping")
    return payload


def _deep_merge(
    base: Mapping[str, Any],
    override: Mapping[str, Any],
) -> dict[str, Any]:
    merged: dict[str, Any] = dict(base)
    for key, value in override.items():
        base_value = merged.get(key)
        if isinstance(base_value, Mapping) and isinstance(value, Mapping):
            merged[key] = _deep_merge(base_value, value)
        else:
            merged[key] = value
    return merged


@lru_cache(maxsize=8)
def _load_app_config(config_path: str) -> AppConfig:
    default_config = _read_yaml(_default_config_path())
    selected_path = Path(config_path)
    raw_config = default_config

    if selected_path.resolve() != _default_config_path().resolve():
        raw_config = _deep_merge(default_config, _read_yaml(selected_path))

    ui_config = raw_config.get("ui")
    if not isinstance(ui_config, dict):
        raise ValueError("config is missing a ui mapping")

    return AppConfig.model_validate(ui_config)


def get_app_config() -> AppConfig:
    return _load_app_config(str(_configured_config_path()))


def clear_app_config_cache() -> None:
    _load_app_config.cache_clear()
