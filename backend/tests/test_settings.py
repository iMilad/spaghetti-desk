from __future__ import annotations

import base64
import os
from pathlib import Path

import httpx
import pytest
import yaml

from app.config import clear_app_config_cache
from app.models import JenkinsConnectionTest, SettingsUpdate
from app.settings import SettingsWriteError, check_jenkins_connection, read_settings, save_settings


@pytest.fixture(autouse=True)
def clear_settings_environment(monkeypatch: pytest.MonkeyPatch):
    for name in (
        "JENKINS_USERNAME",
        "JENKINS_TOKEN",
        "SPAGHETTI_CONFIG_WRITABLE",
        "SPAGHETTI_COMPOSE_ENV_PATH",
    ):
        monkeypatch.delenv(name, raising=False)
    clear_app_config_cache()
    yield
    clear_app_config_cache()


def _select_writable_config(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> tuple[Path, Path]:
    config = tmp_path / "config.yaml"
    config.write_text(
        """
operator:
  id: original-operator
  display_name: Original Operator
  role: admin
collectors:
  enabled: false
  write_to_local_inventory: false
  plugins:
    jenkins:
      enabled: false
      interval_seconds: 300
      base_url: https://jenkins.example.invalid
      username_env: JENKINS_USERNAME
      token_env: JENKINS_TOKEN
      job_include_patterns: []
      default_owner_team: Unassigned
      timeout_seconds: 10
      verify_tls: true
    future-plugin:
      enabled: false
actions:
  enabled: false
  require_approval_by_default: true
  audit_all_attempts: true
custom_private_setting: preserved
""",
        encoding="utf-8",
    )
    compose_env = tmp_path / "compose.env"
    compose_env.write_text("EXISTING_VALUE=preserved\n", encoding="utf-8")
    monkeypatch.setenv("SPAGHETTI_CONFIG_PATH", str(config))
    monkeypatch.setenv("SPAGHETTI_CONFIG_WRITABLE", "true")
    monkeypatch.setenv("SPAGHETTI_COMPOSE_ENV_PATH", str(compose_env))
    clear_app_config_cache()
    return config, compose_env


def _settings_payload(**jenkins_overrides: object) -> SettingsUpdate:
    jenkins: dict[str, object] = {
        "enabled": True,
        "interval_seconds": 600,
        "base_url": "https://jenkins.company.example/",
        "job_include_patterns": ["platform-*", ""],
        "default_owner_team": "Platform",
        "timeout_seconds": 15,
        "verify_tls": True,
        "username": "jenkins-user",
        "token": "jenkins-token",
    }
    jenkins.update(jenkins_overrides)
    return SettingsUpdate.model_validate(
        {
            "operator": {
                "id": "local-admin",
                "display_name": "Local Administrator",
                "role": "admin",
            },
            "collectors_enabled": True,
            "write_to_local_inventory": False,
            "jenkins": jenkins,
            "actions": {
                "enabled": False,
                "require_approval_by_default": True,
                "audit_all_attempts": True,
            },
        }
    )


def test_settings_save_writes_yaml_and_credentials_separately(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    config, compose_env = _select_writable_config(tmp_path, monkeypatch)

    result = save_settings(_settings_payload())

    payload = yaml.safe_load(config.read_text(encoding="utf-8"))
    assert payload["operator"]["display_name"] == "Local Administrator"
    assert payload["collectors"]["plugins"]["jenkins"]["base_url"] == (
        "https://jenkins.company.example"
    )
    assert payload["collectors"]["plugins"]["jenkins"]["job_include_patterns"] == [
        "platform-*"
    ]
    assert payload["collectors"]["plugins"]["future-plugin"]["enabled"] is False
    assert payload["custom_private_setting"] == "preserved"
    assert "jenkins-user" not in config.read_text(encoding="utf-8")
    assert "jenkins-token" not in config.read_text(encoding="utf-8")

    env_text = compose_env.read_text(encoding="utf-8")
    assert "EXISTING_VALUE=preserved" in env_text
    assert 'JENKINS_USERNAME="jenkins-user"' in env_text
    assert 'JENKINS_TOKEN="jenkins-token"' in env_text
    assert os.environ["JENKINS_USERNAME"] == "jenkins-user"
    assert os.environ["JENKINS_TOKEN"] == "jenkins-token"
    assert result.credentials_changed is True
    assert result.settings.jenkins.username_configured is True
    assert result.settings.jenkins.token_configured is True
    assert not list(tmp_path.glob(".config.yaml.*"))


def test_settings_save_preserves_credentials_when_fields_are_blank(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, compose_env = _select_writable_config(tmp_path, monkeypatch)
    monkeypatch.setenv("JENKINS_USERNAME", "existing-user")
    monkeypatch.setenv("JENKINS_TOKEN", "existing-token")
    original_env = compose_env.read_text(encoding="utf-8")

    result = save_settings(_settings_payload(username=None, token=None))

    assert compose_env.read_text(encoding="utf-8") == original_env
    assert result.credentials_changed is False
    assert result.settings.jenkins.username_configured is True
    assert result.settings.jenkins.token_configured is True


def test_settings_save_refuses_unmanaged_config(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    config, _ = _select_writable_config(tmp_path, monkeypatch)
    monkeypatch.delenv("SPAGHETTI_CONFIG_WRITABLE")
    clear_app_config_cache()

    with pytest.raises(SettingsWriteError, match="read-only"):
        save_settings(_settings_payload())

    assert "original-operator" in config.read_text(encoding="utf-8")


def test_read_settings_never_returns_secret_values(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _select_writable_config(tmp_path, monkeypatch)
    monkeypatch.setenv("JENKINS_USERNAME", "private-user")
    monkeypatch.setenv("JENKINS_TOKEN", "private-token")

    serialized = read_settings().model_dump_json()

    assert "private-user" not in serialized
    assert "private-token" not in serialized
    assert '"username_configured":true' in serialized
    assert '"token_configured":true' in serialized


def test_jenkins_connection_test_uses_supplied_credentials(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen_authorization = ""

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal seen_authorization
        seen_authorization = request.headers.get("Authorization", "")
        return httpx.Response(200, json={"jobs": [{"name": "one"}, {"name": "two"}]})

    original_client = httpx.Client
    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(
        "app.settings.httpx.Client",
        lambda **kwargs: original_client(transport=transport, **kwargs),
    )

    result = check_jenkins_connection(
        JenkinsConnectionTest(
            base_url="https://jenkins.company.example",
            timeout_seconds=10,
            verify_tls=True,
            username="test-user",
            token="test-token",
        )
    )

    expected = base64.b64encode(b"test-user:test-token").decode()
    assert result.success is True
    assert result.records_seen == 2
    assert seen_authorization == f"Basic {expected}"
