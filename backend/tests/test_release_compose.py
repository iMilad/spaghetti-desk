from __future__ import annotations

import subprocess
from pathlib import Path

import yaml

PROJECT_ROOT = Path(__file__).resolve().parents[2]
RENDER_SCRIPT = PROJECT_ROOT / "scripts" / "render-release-compose.sh"
DEVELOPMENT_DOCKERFILE = PROJECT_ROOT / "backend" / "Dockerfile"
PRIVATE_COMPOSE_TEMPLATE = PROJECT_ROOT / "docker-compose.private.example.yml"


def test_release_compose_renderer_pins_image_and_keeps_database_private(tmp_path: Path) -> None:
    image = (
        "docker.io/example/spaghetti-desk@sha256:"
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    )
    output = tmp_path / "compose.yaml"

    subprocess.run([str(RENDER_SCRIPT), image, str(output)], check=True)

    rendered = output.read_text(encoding="utf-8")
    payload = yaml.safe_load(rendered)
    services = payload["services"]

    assert "__SPAGHETTI_DESK_IMAGE__" not in rendered
    assert services["app"]["image"] == image
    assert services["migrate"]["image"] == image
    assert "ports" not in services["postgres"]
    assert services["app"]["ports"] == ["${SPAGHETTI_DESK_PORT:-8080}:8000"]
    assert "${POSTGRES_PASSWORD:?" in services["postgres"]["environment"][
        "POSTGRES_PASSWORD"
    ]
    assert services["app"]["read_only"] is True
    assert services["migrate"]["read_only"] is True


def test_release_compose_renderer_rejects_unsafe_image_reference(tmp_path: Path) -> None:
    output = tmp_path / "compose.yaml"

    result = subprocess.run(
        [str(RENDER_SCRIPT), "docker.io/example/image&unexpected", str(output)],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 2
    assert "unsupported characters" in result.stderr
    assert not output.exists()


def test_development_backend_image_installs_included_jenkins_plugin() -> None:
    dockerfile = DEVELOPMENT_DOCKERFILE.read_text(encoding="utf-8")

    assert "COPY plugins/jenkins /app/plugins/jenkins" in dockerfile
    assert "uv pip install --python .venv/bin/python /app/plugins/jenkins" in dockerfile


def test_private_compose_template_selects_ignored_config_and_named_credentials() -> None:
    payload = yaml.safe_load(PRIVATE_COMPOSE_TEMPLATE.read_text(encoding="utf-8"))
    environment = payload["services"]["backend"]["environment"]

    assert environment["SPAGHETTI_CONFIG_PATH"] == "/app/config/local.yaml"
    assert environment["JENKINS_USERNAME"] == "${JENKINS_USERNAME:-}"
    assert environment["JENKINS_TOKEN"] == "${JENKINS_TOKEN:-}"
