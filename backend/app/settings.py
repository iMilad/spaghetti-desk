from __future__ import annotations

import json
import os
import re
import tempfile
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx
import yaml

from app.config import (
    clear_app_config_cache,
    get_config_path,
    get_default_config_path,
    get_runtime_config,
    get_user_config_path,
)
from app.models import (
    ActionsSettings,
    ConnectionTestResponse,
    JenkinsConnectionTest,
    JenkinsSettings,
    OperatorSettings,
    SettingsResponse,
    SettingsStorage,
    SettingsUpdate,
)

_ENV_NAME_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_SETTINGS_WRITE_LOCK = threading.Lock()


class SettingsWriteError(RuntimeError):
    """Raised when a validated settings update cannot be persisted safely."""


@dataclass(frozen=True)
class SettingsSaveResult:
    settings: SettingsResponse
    credentials_changed: bool


def read_settings() -> SettingsResponse:
    raw_config = get_runtime_config()
    operator = _mapping(raw_config.get("operator"))
    collectors = _mapping(raw_config.get("collectors"))
    plugins = _mapping(collectors.get("plugins"))
    jenkins = _mapping(plugins.get("jenkins"))
    actions = _mapping(raw_config.get("actions"))
    username_env, token_env = _jenkins_env_names(jenkins)

    return SettingsResponse(
        operator=OperatorSettings(
            id=_string(operator.get("id"), "local-operator"),
            display_name=_string(operator.get("display_name"), "Local Operator"),
            role=_string(operator.get("role"), "admin"),
        ),
        collectors_enabled=_bool(collectors.get("enabled"), False),
        write_to_local_inventory=_bool(
            collectors.get("write_to_local_inventory"), False
        ),
        jenkins=JenkinsSettings(
            enabled=_bool(jenkins.get("enabled"), False),
            interval_seconds=_int(jenkins.get("interval_seconds"), 300),
            base_url=_string(jenkins.get("base_url"), ""),
            job_include_patterns=_string_list(jenkins.get("job_include_patterns")),
            default_owner_team=_string(jenkins.get("default_owner_team"), "Unassigned"),
            timeout_seconds=_float(jenkins.get("timeout_seconds"), 10),
            verify_tls=_bool(jenkins.get("verify_tls"), True),
            username_configured=bool(os.getenv(username_env)),
            token_configured=bool(os.getenv(token_env)),
        ),
        actions=ActionsSettings(
            enabled=_bool(actions.get("enabled"), False),
            require_approval_by_default=_bool(
                actions.get("require_approval_by_default"), True
            ),
            audit_all_attempts=_bool(actions.get("audit_all_attempts"), True),
        ),
        storage=_settings_storage(),
    )


def save_settings(payload: SettingsUpdate) -> SettingsSaveResult:
    storage = _settings_storage()
    if not storage.writable:
        raise SettingsWriteError(storage.message)

    config_path = get_config_path()
    compose_env_path = _compose_env_path(config_path)

    with _SETTINGS_WRITE_LOCK:
        current_config = get_runtime_config()
        current_collectors = _mapping(current_config.get("collectors"))
        current_plugins = _mapping(current_collectors.get("plugins"))
        current_jenkins = _mapping(current_plugins.get("jenkins"))
        username_env, token_env = _jenkins_env_names(current_jenkins)

        private_config = _read_private_yaml(config_path)
        private_config["operator"] = {
            "id": payload.operator.id,
            "display_name": payload.operator.display_name,
            "role": payload.operator.role,
        }
        collectors = _mapping_copy(private_config.get("collectors"))
        collectors["enabled"] = payload.collectors_enabled
        collectors["write_to_local_inventory"] = payload.write_to_local_inventory
        plugins = _mapping_copy(collectors.get("plugins"))
        plugins["jenkins"] = {
            "enabled": payload.jenkins.enabled,
            "interval_seconds": payload.jenkins.interval_seconds,
            "base_url": payload.jenkins.base_url,
            "username_env": username_env,
            "token_env": token_env,
            "job_include_patterns": payload.jenkins.job_include_patterns,
            "default_owner_team": payload.jenkins.default_owner_team,
            "timeout_seconds": payload.jenkins.timeout_seconds,
            "verify_tls": payload.jenkins.verify_tls,
        }
        collectors["plugins"] = plugins
        private_config["collectors"] = collectors
        private_config["actions"] = {
            "enabled": payload.actions.enabled,
            "require_approval_by_default": payload.actions.require_approval_by_default,
            "audit_all_attempts": payload.actions.audit_all_attempts,
        }

        yaml_text = yaml.safe_dump(
            private_config,
            sort_keys=False,
            default_flow_style=False,
            allow_unicode=True,
        )
        _atomic_write(config_path, yaml_text)

        credentials_changed = _update_credentials(
            compose_env_path=compose_env_path,
            username_env=username_env,
            token_env=token_env,
            username=payload.jenkins.username,
            token=payload.jenkins.token,
            clear=payload.jenkins.clear_credentials,
        )

        clear_app_config_cache()
        settings = read_settings()

    return SettingsSaveResult(
        settings=settings,
        credentials_changed=credentials_changed,
    )


def check_jenkins_connection(payload: JenkinsConnectionTest) -> ConnectionTestResponse:
    current_config = get_runtime_config()
    collectors = _mapping(current_config.get("collectors"))
    plugins = _mapping(collectors.get("plugins"))
    jenkins = _mapping(plugins.get("jenkins"))
    username_env, token_env = _jenkins_env_names(jenkins)
    username = payload.username if payload.username is not None else os.getenv(username_env)
    token = payload.token if payload.token is not None else os.getenv(token_env)
    auth = (username, token) if username is not None and token is not None else None

    try:
        with httpx.Client(
            auth=auth,
            timeout=payload.timeout_seconds,
            verify=payload.verify_tls,
        ) as client:
            response = client.get(
                f"{payload.base_url}/api/json",
                params={"tree": "jobs[name]"},
            )
            response.raise_for_status()
            body = response.json()
    except httpx.HTTPStatusError as error:
        return ConnectionTestResponse(
            success=False,
            message=(
                f"Jenkins returned HTTP {error.response.status_code}. "
                "Check the URL and credentials."
            ),
        )
    except (httpx.RequestError, ValueError) as error:
        return ConnectionTestResponse(
            success=False,
            message=f"Could not connect to Jenkins: {error}",
        )

    jobs = body.get("jobs", []) if isinstance(body, dict) else []
    records_seen = len(jobs) if isinstance(jobs, list) else 0
    return ConnectionTestResponse(
        success=True,
        message=f"Connection successful. Jenkins returned {records_seen} jobs.",
        records_seen=records_seen,
    )


def _settings_storage() -> SettingsStorage:
    config_path = get_config_path()
    default_path = get_default_config_path()
    user_path = get_user_config_path()
    explicit_writable = os.getenv("SPAGHETTI_CONFIG_WRITABLE", "").casefold() in {
        "1",
        "true",
        "yes",
    }
    is_user_config = config_path.resolve() == user_path.resolve()
    is_public_default = config_path.resolve() == default_path.resolve()
    writable = not is_public_default and (explicit_writable or is_user_config)

    if writable:
        return SettingsStorage(
            writable=True,
            source="user_configuration",
            message="Settings are stored in the private user configuration.",
        )
    if is_public_default:
        return SettingsStorage(
            writable=False,
            source="public_defaults",
            message=(
                "Run scripts/install-local.py and start Docker with its generated "
                "command to enable saving."
            ),
        )
    return SettingsStorage(
        writable=False,
        source="read_only_configuration",
        message=(
            "The selected configuration is read-only. Enable the managed writable "
            "mount before saving."
        ),
    )


def _compose_env_path(config_path: Path) -> Path:
    configured = os.getenv("SPAGHETTI_COMPOSE_ENV_PATH", "").strip()
    return Path(configured).expanduser() if configured else config_path.parent / "compose.env"


def _read_private_yaml(path: Path) -> dict[str, Any]:
    try:
        payload = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as error:
        raise SettingsWriteError(f"Could not read the private configuration: {error}") from error
    if not isinstance(payload, dict):
        raise SettingsWriteError("The private configuration must contain a YAML mapping.")
    return dict(payload)


def _atomic_write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=path.parent,
            prefix=f".{path.name}.",
            delete=False,
        ) as temporary:
            temporary.write(content)
            temporary.flush()
            os.fsync(temporary.fileno())
            temporary_path = Path(temporary.name)
        if os.name != "nt":
            temporary_path.chmod(0o600)
        os.replace(temporary_path, path)
    except OSError as error:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)
        raise SettingsWriteError(f"Could not write {path.name}: {error}") from error


def _update_credentials(
    *,
    compose_env_path: Path,
    username_env: str,
    token_env: str,
    username: str | None,
    token: str | None,
    clear: bool,
) -> bool:
    if not clear and username is None and token is None:
        return False

    existing_lines = (
        compose_env_path.read_text(encoding="utf-8").splitlines()
        if compose_env_path.exists()
        else [
            "# Managed by Spaghetti Desk.",
            "# Keep credentials private and never commit this file.",
        ]
    )
    updates: dict[str, str | None] = {}
    if clear:
        updates = {username_env: "", token_env: ""}
        os.environ.pop(username_env, None)
        os.environ.pop(token_env, None)
    else:
        if username is not None:
            updates[username_env] = username
            os.environ[username_env] = username
        if token is not None:
            updates[token_env] = token
            os.environ[token_env] = token

    output: list[str] = []
    remaining = dict(updates)
    for line in existing_lines:
        name = line.partition("=")[0].strip()
        if name in remaining:
            output.append(f"{name}={json.dumps(remaining.pop(name))}")
        else:
            output.append(line)
    if remaining and output and output[-1]:
        output.append("")
    output.extend(f"{name}={json.dumps(value)}" for name, value in remaining.items())
    _atomic_write(compose_env_path, "\n".join(output) + "\n")
    return True


def _jenkins_env_names(settings: dict[str, Any]) -> tuple[str, str]:
    username_env = _string(settings.get("username_env"), "JENKINS_USERNAME")
    token_env = _string(settings.get("token_env"), "JENKINS_TOKEN")
    if not _ENV_NAME_PATTERN.fullmatch(username_env):
        username_env = "JENKINS_USERNAME"
    if not _ENV_NAME_PATTERN.fullmatch(token_env):
        token_env = "JENKINS_TOKEN"
    return username_env, token_env


def _mapping(value: object) -> dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _mapping_copy(value: object) -> dict[str, Any]:
    return _mapping(value)


def _string(value: object, default: str) -> str:
    return value.strip() if isinstance(value, str) and value.strip() else default


def _string_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item.strip() for item in value if isinstance(item, str) and item.strip()]


def _bool(value: object, default: bool) -> bool:
    return value if isinstance(value, bool) else default


def _int(value: object, default: int) -> int:
    return value if isinstance(value, int) and not isinstance(value, bool) else default


def _float(value: object, default: float) -> float:
    if isinstance(value, int | float) and not isinstance(value, bool):
        return float(value)
    return default
