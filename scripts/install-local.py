#!/usr/bin/env python3
"""Prepare private per-user configuration for a local Spaghetti Desk install."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

APP_DIRECTORY_NAME = "spaghetti-desk"
CONFIG_FILE_NAME = "config.yaml"
COMPOSE_ENV_FILE_NAME = "compose.env"
HOST_CONFIG_VARIABLE = "SPAGHETTI_CONFIG_HOST_PATH"


def default_config_directory() -> Path:
    """Return the platform-appropriate per-user configuration directory."""
    xdg_config_home = os.getenv("XDG_CONFIG_HOME")
    if xdg_config_home:
        return Path(xdg_config_home).expanduser() / APP_DIRECTORY_NAME

    app_data = os.getenv("APPDATA")
    if os.name == "nt" and app_data:
        return Path(app_data).expanduser() / "SpaghettiDesk"

    return Path.home() / ".config" / APP_DIRECTORY_NAME


def _secure_permissions(path: Path, mode: int) -> None:
    if os.name != "nt":
        path.chmod(mode)


def _create_config(template: Path, destination: Path) -> bool:
    try:
        with destination.open("x", encoding="utf-8") as config_file:
            config_file.write(template.read_text(encoding="utf-8"))
    except FileExistsError:
        return False

    _secure_permissions(destination, 0o600)
    return True


def _write_compose_environment(path: Path, config_path: Path) -> None:
    assignment = f"{HOST_CONFIG_VARIABLE}={json.dumps(config_path.as_posix())}"
    header = [
        "# Managed by scripts/install-local.py.",
        "# Keep credentials private and never commit this file.",
    ]
    existing_lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    updated_lines: list[str] = []
    replaced = False

    for line in existing_lines:
        if line.startswith(f"{HOST_CONFIG_VARIABLE}="):
            if not replaced:
                updated_lines.append(assignment)
                replaced = True
            continue
        updated_lines.append(line)

    if not existing_lines:
        updated_lines.extend(header)
    if not replaced:
        if updated_lines and updated_lines[-1]:
            updated_lines.append("")
        updated_lines.append(assignment)

    path.write_text("\n".join(updated_lines) + "\n", encoding="utf-8")
    _secure_permissions(path, 0o600)


def install(config_directory: Path, template: Path) -> tuple[Path, Path, bool]:
    config_directory.mkdir(parents=True, exist_ok=True)
    _secure_permissions(config_directory, 0o700)

    config_path = config_directory / CONFIG_FILE_NAME
    created = _create_config(template, config_path)
    _secure_permissions(config_path, 0o600)

    compose_env_path = config_directory / COMPOSE_ENV_FILE_NAME
    _write_compose_environment(compose_env_path, config_path.resolve())
    return config_path, compose_env_path, created


def _parse_args() -> argparse.Namespace:
    project_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(
        description="Create private user configuration and Docker path settings."
    )
    parser.add_argument(
        "--config-dir",
        type=Path,
        default=default_config_directory(),
        help="override the platform user configuration directory",
    )
    parser.add_argument(
        "--template",
        type=Path,
        default=project_root / "config" / "private.example.yaml",
        help=argparse.SUPPRESS,
    )
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    if not args.template.is_file():
        raise SystemExit(f"configuration template not found: {args.template}")

    config_path, compose_env_path, created = install(
        args.config_dir.expanduser(), args.template
    )
    state = "created" if created else "kept existing"
    print(f"Configuration: {config_path} ({state})")
    print(f"Docker settings: {compose_env_path}")
    print("Start Spaghetti Desk with:")
    compose_env_argument = json.dumps(compose_env_path.as_posix())
    print(f"  docker compose --env-file {compose_env_argument} up --build")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
