from __future__ import annotations

import os
import subprocess
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
INSTALLER = PROJECT_ROOT / "scripts" / "install-local.py"
TEMPLATE = PROJECT_ROOT / "config" / "private.example.yaml"


def _run_installer(config_dir: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(INSTALLER), "--config-dir", str(config_dir)],
        check=True,
        capture_output=True,
        text=True,
    )


def test_installer_creates_private_config_and_docker_environment(tmp_path: Path) -> None:
    config_dir = tmp_path / "spaghetti-desk"

    result = _run_installer(config_dir)

    config_path = config_dir / "config.yaml"
    compose_env_path = config_dir / "compose.env"
    assert config_path.read_text(encoding="utf-8") == TEMPLATE.read_text(encoding="utf-8")
    assert (
        f'SPAGHETTI_CONFIG_HOST_PATH="{config_path.as_posix()}"'
        in compose_env_path.read_text(encoding="utf-8")
    )
    assert "(created)" in result.stdout
    if os.name != "nt":
        assert config_dir.stat().st_mode & 0o777 == 0o700
        assert config_path.stat().st_mode & 0o777 == 0o600
        assert compose_env_path.stat().st_mode & 0o777 == 0o600


def test_installer_never_overwrites_existing_config_or_other_env_values(
    tmp_path: Path,
) -> None:
    config_dir = tmp_path / "spaghetti-desk"
    _run_installer(config_dir)
    config_path = config_dir / "config.yaml"
    compose_env_path = config_dir / "compose.env"
    config_path.write_text("operator:\n  display_name: Kept\n", encoding="utf-8")
    if os.name != "nt":
        config_path.chmod(0o644)
    compose_env_path.write_text(
        "JENKINS_TOKEN=keep-this-value\nSPAGHETTI_CONFIG_HOST_PATH=old\n",
        encoding="utf-8",
    )

    result = _run_installer(config_dir)

    assert config_path.read_text(encoding="utf-8") == "operator:\n  display_name: Kept\n"
    compose_environment = compose_env_path.read_text(encoding="utf-8")
    assert "JENKINS_TOKEN=keep-this-value" in compose_environment
    assert "SPAGHETTI_CONFIG_HOST_PATH=old" not in compose_environment
    assert f'SPAGHETTI_CONFIG_HOST_PATH="{config_path.as_posix()}"' in compose_environment
    assert "(kept existing)" in result.stdout
    if os.name != "nt":
        assert config_path.stat().st_mode & 0o777 == 0o600
