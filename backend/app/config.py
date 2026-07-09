from __future__ import annotations

import os
from collections.abc import Mapping
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

from app.models import AppConfig, CurrentOperator


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
def _load_runtime_config(config_path: str) -> dict[str, Any]:
    default_config = _read_yaml(_default_config_path())
    selected_path = Path(config_path)
    raw_config = default_config

    if selected_path.resolve() != _default_config_path().resolve():
        raw_config = _deep_merge(default_config, _read_yaml(selected_path))

    return raw_config


@lru_cache(maxsize=8)
def _load_app_config(config_path: str) -> AppConfig:
    raw_config = _load_runtime_config(config_path)
    ui_config = raw_config.get("ui")
    if not isinstance(ui_config, dict):
        raise ValueError("config is missing a ui mapping")

    return AppConfig.model_validate(ui_config)


def get_runtime_config() -> dict[str, Any]:
    return _load_runtime_config(str(_configured_config_path()))


def get_app_config() -> AppConfig:
    return _load_app_config(str(_configured_config_path()))


def get_current_operator() -> CurrentOperator:
    return _current_operator_from_config(get_runtime_config())


def clear_app_config_cache() -> None:
    _load_runtime_config.cache_clear()
    _load_app_config.cache_clear()


def _current_operator_from_config(raw_config: Mapping[str, Any]) -> CurrentOperator:
    operator_config = raw_config.get("operator", {})
    if operator_config is None:
        operator_config = {}
    if not isinstance(operator_config, Mapping):
        raise ValueError("config operator must be a mapping")

    config_identity = {
        "id": _string_config_value(operator_config, "id", "local-operator"),
        "display_name": _string_config_value(operator_config, "display_name", "Local Operator"),
        "role": _string_config_value(operator_config, "role", "admin"),
        "source": "config",
    }

    env_identity = {
        "id": _env_string("SPAGHETTI_OPERATOR_ID"),
        "display_name": _env_string("SPAGHETTI_OPERATOR_DISPLAY_NAME"),
        "role": _env_string("SPAGHETTI_OPERATOR_ROLE"),
    }
    if any(value is not None for value in env_identity.values()):
        config_identity.update(
            {key: value for key, value in env_identity.items() if value is not None}
        )
        config_identity["source"] = "environment"

    return CurrentOperator.model_validate(config_identity)


def _string_config_value(
    values: Mapping[str, Any],
    key: str,
    default: str,
) -> str:
    value = values.get(key, default)
    if not isinstance(value, str):
        raise ValueError(f"config operator.{key} must be a string")
    return value.strip() or default


def _env_string(name: str) -> str | None:
    value = os.getenv(name)
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None
