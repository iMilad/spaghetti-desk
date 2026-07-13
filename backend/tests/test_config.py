from __future__ import annotations

from pathlib import Path

import pytest

from app.config import clear_app_config_cache, get_runtime_config

PROJECT_ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(autouse=True)
def clear_config_cache():
    clear_app_config_cache()
    yield
    clear_app_config_cache()


def _select_config(path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SPAGHETTI_CONFIG_PATH", str(path))


def test_runtime_config_reports_missing_private_file(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    missing = tmp_path / "missing.yaml"
    _select_config(missing, monkeypatch)

    with pytest.raises(ValueError, match=r"config file .*missing\.yaml does not exist"):
        get_runtime_config()


def test_runtime_config_reports_invalid_yaml(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    config = tmp_path / "invalid.yaml"
    config.write_text("collectors: [", encoding="utf-8")
    _select_config(config, monkeypatch)

    with pytest.raises(ValueError, match="contains invalid YAML"):
        get_runtime_config()


def test_runtime_config_rejects_invalid_collector_types(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    config = tmp_path / "invalid-collector.yaml"
    config.write_text(
        """
collectors:
  enabled: "yes"
""",
        encoding="utf-8",
    )
    _select_config(config, monkeypatch)

    with pytest.raises(ValueError, match="collectors.enabled must be true or false"):
        get_runtime_config()


def test_runtime_config_rejects_invalid_collector_interval(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    config = tmp_path / "invalid-interval.yaml"
    config.write_text(
        """
collectors:
  plugins:
    jenkins:
      interval_seconds: 0
""",
        encoding="utf-8",
    )
    _select_config(config, monkeypatch)

    with pytest.raises(ValueError, match="jenkins.interval_seconds must be a positive integer"):
        get_runtime_config()


def test_runtime_config_rejects_unexpanded_environment_references(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    config = tmp_path / "environment-reference.yaml"
    config.write_text(
        """
collectors:
  plugins:
    jenkins:
      base_url: ${JENKINS_URL}
""",
        encoding="utf-8",
    )
    _select_config(config, monkeypatch)

    with pytest.raises(
        ValueError,
        match=r"config\.collectors\.plugins\.jenkins\.base_url contains an unsupported",
    ):
        get_runtime_config()


def test_runtime_config_accepts_private_collector_override(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    config = tmp_path / "local.yaml"
    config.write_text(
        """
collectors:
  enabled: true
  write_to_local_inventory: false
  plugins:
    jenkins:
      enabled: true
      base_url: https://jenkins.company.example
      username_env: JENKINS_USERNAME
      token_env: JENKINS_TOKEN
""",
        encoding="utf-8",
    )
    _select_config(config, monkeypatch)

    runtime_config = get_runtime_config()

    assert runtime_config["collectors"]["enabled"] is True
    assert runtime_config["collectors"]["write_to_local_inventory"] is False
    assert runtime_config["collectors"]["plugins"]["jenkins"]["interval_seconds"] == 300


def test_private_config_template_is_valid_and_safe_by_default(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    template = PROJECT_ROOT / "config" / "private.example.yaml"
    _select_config(template, monkeypatch)

    runtime_config = get_runtime_config()

    assert runtime_config["collectors"]["enabled"] is False
    assert runtime_config["collectors"]["write_to_local_inventory"] is False
    assert runtime_config["collectors"]["plugins"]["jenkins"]["enabled"] is False
    assert runtime_config["collectors"]["plugins"]["jenkins"]["base_url"].endswith(
        ".example.invalid"
    )
