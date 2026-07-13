from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.config import clear_app_config_cache
from app.main import app
from app.models import ConnectionTestResponse
from app.persistence.base import Base
from app.persistence.database import get_session
from app.persistence.repositories import ActionLogRepository

PROJECT_ROOT = Path(__file__).resolve().parents[2]
client = TestClient(app)


@pytest.fixture(autouse=True)
def clear_settings_state(monkeypatch: pytest.MonkeyPatch):
    for name in (
        "JENKINS_USERNAME",
        "JENKINS_TOKEN",
        "SPAGHETTI_CONFIG_PATH",
        "SPAGHETTI_CONFIG_WRITABLE",
        "SPAGHETTI_COMPOSE_ENV_PATH",
        "SPAGHETTI_OPERATOR_ID",
        "SPAGHETTI_OPERATOR_DISPLAY_NAME",
        "SPAGHETTI_OPERATOR_ROLE",
    ):
        monkeypatch.delenv(name, raising=False)
    app.dependency_overrides.clear()
    clear_app_config_cache()
    yield
    app.dependency_overrides.clear()
    clear_app_config_cache()


def _configure_managed_settings(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> Path:
    config = tmp_path / "config.yaml"
    config.write_text(
        (PROJECT_ROOT / "config" / "private.example.yaml").read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    compose_env = tmp_path / "compose.env"
    compose_env.write_text("# private test environment\n", encoding="utf-8")
    monkeypatch.setenv("SPAGHETTI_CONFIG_PATH", str(config))
    monkeypatch.setenv("SPAGHETTI_CONFIG_WRITABLE", "true")
    monkeypatch.setenv("SPAGHETTI_COMPOSE_ENV_PATH", str(compose_env))
    clear_app_config_cache()
    return config


def _settings_payload() -> dict[str, object]:
    return {
        "operator": {
            "id": "settings-admin",
            "display_name": "Settings Administrator",
            "role": "admin",
        },
        "collectors_enabled": False,
        "write_to_local_inventory": False,
        "jenkins": {
            "enabled": False,
            "interval_seconds": 300,
            "base_url": "https://jenkins.company.example",
            "job_include_patterns": ["platform-*"],
            "default_owner_team": "Platform",
            "timeout_seconds": 10,
            "verify_tls": True,
            "username": "api-user",
            "token": "api-token",
        },
        "actions": {
            "enabled": False,
            "require_approval_by_default": True,
            "audit_all_attempts": True,
        },
    }


def test_settings_api_saves_configuration_and_audits_change(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    config = _configure_managed_settings(tmp_path, monkeypatch)
    engine = create_engine(f"sqlite+pysqlite:///{tmp_path / 'inventory.db'}")
    Base.metadata.create_all(engine)

    def override_session():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_session

    response = client.post("/api/v1/settings", json=_settings_payload())

    assert response.status_code == 200
    body = response.json()
    assert body["settings"]["operator"]["display_name"] == "Settings Administrator"
    assert body["settings"]["jenkins"]["username_configured"] is True
    assert body["settings"]["jenkins"]["token_configured"] is True
    assert body["collector_runtime_reloaded"] is True
    assert "api-user" not in response.text
    assert "api-token" not in response.text
    assert "Settings Administrator" in config.read_text(encoding="utf-8")

    with Session(engine) as session:
        logs = ActionLogRepository(session).list_action_logs(limit=10, offset=0)
    assert logs.total == 1
    assert logs.items[0].action_type == "settings.update"
    assert logs.items[0].execution_status == "succeeded"
    assert logs.items[0].sanitized_parameters["credentials_supplied"] == "[redacted]"
    assert logs.items[0].after_state["credentials_changed"] == "True"


def test_settings_api_rejects_non_admin_operator(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _configure_managed_settings(tmp_path, monkeypatch)
    monkeypatch.setenv("SPAGHETTI_OPERATOR_ROLE", "viewer")

    response = client.post("/api/v1/settings", json=_settings_payload())

    assert response.status_code == 403
    assert response.json()["detail"] == (
        "Only an administrator can change integration settings."
    )


def test_settings_api_tests_jenkins_without_saving(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    config = _configure_managed_settings(tmp_path, monkeypatch)
    before = config.read_text(encoding="utf-8")
    monkeypatch.setattr(
        "app.api.routes.check_jenkins_connection",
        lambda payload: ConnectionTestResponse(
            success=True,
            message="Connection successful. Jenkins returned 3 jobs.",
            records_seen=3,
        ),
    )

    response = client.post(
        "/api/v1/settings/test-jenkins",
        json={
            "base_url": "https://jenkins.company.example",
            "timeout_seconds": 10,
            "verify_tls": True,
            "username": "temporary-user",
            "token": "temporary-token",
        },
    )

    assert response.status_code == 200
    assert response.json()["records_seen"] == 3
    assert config.read_text(encoding="utf-8") == before
