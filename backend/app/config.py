from __future__ import annotations

import os
import re
from collections.abc import Mapping
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

from app.models import AppConfig, CurrentOperator

_ENV_REFERENCE_PATTERN = re.compile(r"\$\{[A-Za-z_][A-Za-z0-9_]*[^}]*\}")


def _project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _default_config_path() -> Path:
    return _project_root() / "config" / "config.example.yaml"


def _user_config_path() -> Path:
    xdg_config_home = os.getenv("XDG_CONFIG_HOME")
    if xdg_config_home:
        config_home = Path(xdg_config_home)
    elif os.name == "nt" and os.getenv("APPDATA"):
        config_home = Path(os.environ["APPDATA"])
    else:
        config_home = Path.home() / ".config"

    return config_home / "spaghetti-desk" / "config.yaml"


def _configured_config_path() -> Path:
    explicit_path = os.getenv("SPAGHETTI_CONFIG_PATH")
    if explicit_path:
        return Path(explicit_path).expanduser()

    user_path = _user_config_path()
    if user_path.is_file():
        return user_path

    return _default_config_path()


def _read_yaml(path: Path) -> dict[str, Any]:
    try:
        content = path.read_text(encoding="utf-8")
    except FileNotFoundError as error:
        raise ValueError(f"config file {path} does not exist") from error
    except OSError as error:
        raise ValueError(f"config file {path} could not be read: {error}") from error

    try:
        payload = yaml.safe_load(content)
    except yaml.YAMLError as error:
        raise ValueError(f"config file {path} contains invalid YAML: {error}") from error

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

    _validate_runtime_config(raw_config)
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


def _validate_runtime_config(raw_config: Mapping[str, Any]) -> None:
    _require_mapping(raw_config, "ui")
    _validate_operator_config(raw_config)
    _validate_collector_config(raw_config)
    _validate_actions_config(raw_config)
    _reject_environment_references(raw_config)


def _validate_operator_config(raw_config: Mapping[str, Any]) -> None:
    operator = raw_config.get("operator", {})
    if operator is None:
        return
    if not isinstance(operator, Mapping):
        raise ValueError("config operator must be a mapping")
    for key in ("id", "display_name", "role"):
        value = operator.get(key)
        if value is not None and not isinstance(value, str):
            raise ValueError(f"config operator.{key} must be a string")


def _validate_collector_config(raw_config: Mapping[str, Any]) -> None:
    collectors = _require_mapping(raw_config, "collectors")
    _require_bool(collectors, "enabled", "collectors")
    _require_bool(collectors, "write_to_local_inventory", "collectors")
    _require_positive_int(collectors, "default_interval_seconds", "collectors")

    plugins = collectors.get("plugins", {})
    if not isinstance(plugins, Mapping):
        raise ValueError("config collectors.plugins must be a mapping")

    for name, plugin in plugins.items():
        if not isinstance(name, str) or not name.strip():
            raise ValueError("config collectors.plugins keys must be non-empty strings")
        if not isinstance(plugin, Mapping):
            raise ValueError(f"config collectors.plugins.{name} must be a mapping")
        _require_bool(plugin, "enabled", f"collectors.plugins.{name}")
        _require_positive_int(plugin, "interval_seconds", f"collectors.plugins.{name}")


def _validate_actions_config(raw_config: Mapping[str, Any]) -> None:
    actions = _require_mapping(raw_config, "actions")
    for key in ("enabled", "require_approval_by_default", "audit_all_attempts"):
        _require_bool(actions, key, "actions")


def _require_mapping(values: Mapping[str, Any], key: str) -> Mapping[str, Any]:
    value = values.get(key)
    if not isinstance(value, Mapping):
        raise ValueError(f"config {key} must be a mapping")
    return value


def _require_bool(values: Mapping[str, Any], key: str, path: str) -> None:
    value = values.get(key)
    if value is not None and not isinstance(value, bool):
        raise ValueError(f"config {path}.{key} must be true or false")


def _require_positive_int(values: Mapping[str, Any], key: str, path: str) -> None:
    value = values.get(key)
    if value is not None and (not isinstance(value, int) or isinstance(value, bool) or value <= 0):
        raise ValueError(f"config {path}.{key} must be a positive integer")


def _reject_environment_references(value: object, path: str = "config") -> None:
    if isinstance(value, str):
        if _ENV_REFERENCE_PATTERN.search(value):
            raise ValueError(
                f"{path} contains an unsupported environment reference; "
                "write non-secret values directly in private YAML and use *_env settings "
                "for credentials"
            )
        return

    if isinstance(value, Mapping):
        for key, item in value.items():
            _reject_environment_references(item, f"{path}.{key}")
        return

    if isinstance(value, list):
        for index, item in enumerate(value):
            _reject_environment_references(item, f"{path}[{index}]")
