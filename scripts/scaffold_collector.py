from __future__ import annotations

import argparse
import re
import sys
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

COLLECTOR_KEY_PATTERN = re.compile(r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$")
PACKAGE_NAME_PATTERN = re.compile(r"^[a-z0-9][a-z0-9._-]*[a-z0-9]$")
COMMON_ACRONYMS = {
    "api",
    "aws",
    "cd",
    "ci",
    "db",
    "dns",
    "id",
    "ip",
    "oidc",
    "saml",
    "ssl",
    "tls",
    "url",
    "vm",
}


class ScaffoldError(ValueError):
    pass


@dataclass(frozen=True)
class CollectorScaffold:
    key: str
    provider_name: str
    package_name: str
    module_name: str
    class_prefix: str
    env_prefix: str
    target_dir: Path

    @property
    def package_dir(self) -> Path:
        return Path(self.module_name)

    @property
    def test_file(self) -> Path:
        module_suffix = self.module_name.removeprefix("spaghetti_desk_")
        return Path("tests") / f"test_{module_suffix}_collector.py"

    @property
    def example_base_url(self) -> str:
        return f"https://{self.key}.example.invalid"


def main(argv: Sequence[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    try:
        scaffold = build_scaffold(
            collector_key=args.collector_key,
            output_dir=Path(args.output_dir),
            provider_name=args.provider_name,
            package_name=args.package_name,
        )
        create_scaffold(scaffold)
    except ScaffoldError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    print(f"Created collector scaffold: {scaffold.target_dir}")
    print(f"Collector key: {scaffold.key}")
    print(f"Package name: {scaffold.package_name}")
    print("Next steps:")
    print(f"  cd backend && uv pip install -e {_install_path(scaffold)}")
    print("  Put real endpoints and credentials only in ignored private config.")
    return 0


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Create a public-safe optional collector plugin package.",
    )
    parser.add_argument(
        "collector_key",
        help="Collector key used by config and entry points, for example example-ci.",
    )
    parser.add_argument(
        "--output-dir",
        default="plugins",
        help="Directory that will receive the collector package. Defaults to plugins.",
    )
    parser.add_argument(
        "--provider-name",
        help="Human-readable provider name. Defaults to a title-cased collector key.",
    )
    parser.add_argument(
        "--package-name",
        help="Python distribution name. Defaults to spaghetti-desk-collector-<key>.",
    )
    return parser


def build_scaffold(
    *,
    collector_key: str,
    output_dir: Path,
    provider_name: str | None = None,
    package_name: str | None = None,
) -> CollectorScaffold:
    key = collector_key.strip().casefold()
    if not COLLECTOR_KEY_PATTERN.fullmatch(key):
        raise ScaffoldError(
            "collector key must be lowercase kebab-case, for example example-ci"
        )

    resolved_provider_name = provider_name.strip() if provider_name else _display_name(key)
    if not resolved_provider_name:
        raise ScaffoldError("provider name cannot be empty")

    resolved_package_name = (
        package_name.strip() if package_name else f"spaghetti-desk-collector-{key}"
    )
    if not PACKAGE_NAME_PATTERN.fullmatch(resolved_package_name):
        raise ScaffoldError("package name must contain only lowercase package-safe characters")

    module_suffix = key.replace("-", "_")
    return CollectorScaffold(
        key=key,
        provider_name=resolved_provider_name,
        package_name=resolved_package_name,
        module_name=f"spaghetti_desk_{module_suffix}",
        class_prefix=_class_prefix(resolved_provider_name),
        env_prefix=module_suffix.upper(),
        target_dir=output_dir / key,
    )


def create_scaffold(scaffold: CollectorScaffold) -> None:
    if scaffold.target_dir.exists():
        raise ScaffoldError(f"target directory already exists: {scaffold.target_dir}")

    files = _render_files(scaffold)
    scaffold.target_dir.mkdir(parents=True)
    for relative_path in sorted(files, key=str):
        path = scaffold.target_dir / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(files[relative_path], encoding="utf-8")


def _render_files(scaffold: CollectorScaffold) -> dict[Path, str]:
    return {
        Path("pyproject.toml"): _pyproject(scaffold),
        Path("README.md"): _readme(scaffold),
        scaffold.package_dir / "__init__.py": _collector_module(scaffold),
        scaffold.test_file: _collector_tests(scaffold),
    }


def _display_name(key: str) -> str:
    return " ".join(_display_word(part) for part in key.split("-"))


def _display_word(word: str) -> str:
    return word.upper() if word in COMMON_ACRONYMS else word.capitalize()


def _class_prefix(provider_name: str) -> str:
    words = [
        word
        for word in re.split(r"[^a-zA-Z0-9]+", provider_name)
        if word
    ]
    prefix = "".join(_class_word(word) for word in words)
    if not prefix or not prefix[0].isalpha():
        raise ScaffoldError("provider name must contain at least one alphabetic word")
    return prefix


def _class_word(word: str) -> str:
    return word.upper() if word.casefold() in COMMON_ACRONYMS else word.capitalize()


def _install_path(scaffold: CollectorScaffold) -> str:
    if scaffold.target_dir.is_absolute():
        return scaffold.target_dir.as_posix()
    return f"../{scaffold.target_dir.as_posix()}"


def _pyproject(scaffold: CollectorScaffold) -> str:
    return f"""[build-system]
requires = ["setuptools>=70"]
build-backend = "setuptools.build_meta"

[project]
name = "{scaffold.package_name}"
version = "0.1.0"
description = "Optional {scaffold.provider_name} collector plugin for Spaghetti Desk."
requires-python = ">=3.12"
dependencies = [
  "httpx>=0.27,<1",
  "spaghetti-desk-backend>=0.2.0",
]

[project.entry-points."spaghetti_desk.collectors"]
{scaffold.key} = "{scaffold.module_name}:plugin"

[tool.setuptools.packages.find]
include = ["{scaffold.module_name}*"]

[tool.pytest.ini_options]
testpaths = ["tests"]
"""


def _readme(scaffold: CollectorScaffold) -> str:
    return f"""# {scaffold.provider_name} Collector Plugin

Optional {scaffold.provider_name} collector for Spaghetti Desk.

Install it into the backend environment only when a deployment uses
{scaffold.provider_name}:

```bash
cd backend
uv pip install -e {_install_path(scaffold)}
```

Enable it in private deployment config, not in the public repository:

```yaml
collectors:
  enabled: true
  plugins:
    {scaffold.key}:
      enabled: true
      interval_seconds: 300
      base_url: {scaffold.example_base_url}
      token_env: {scaffold.env_prefix}_TOKEN
      default_owner_team: Unassigned
      timeout_seconds: 10
```

Replace the example URL in an ignored local config file before enabling the
collector. Keep real endpoints, tokens, usernames, team mappings, and exported
inventory data out of the public repository.

The plugin reads {scaffold.provider_name} metadata and writes normalized
pipeline records to the local Spaghetti Desk database. The UI/API should read
that local state; it should not call external systems during normal page
rendering.
"""


def _collector_module(scaffold: CollectorScaffold) -> str:
    prefix = scaffold.class_prefix
    return f'''from __future__ import annotations

import os
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import httpx

from app.collectors import CollectorContext, CollectorPluginConfig, CollectorResult
from app.models import Pipeline
from app.persistence.repositories import PipelineRepository


@dataclass(frozen=True)
class {prefix}Settings:
    base_url: str
    token_env: str | None
    default_owner_team: str
    timeout_seconds: float

    @classmethod
    def from_mapping(cls, settings: Mapping[str, object]) -> {prefix}Settings:
        return cls(
            base_url=_string_setting(settings, "base_url").rstrip("/"),
            token_env=_optional_string_setting(settings, "token_env"),
            default_owner_team=_string_setting(settings, "default_owner_team", "Unassigned"),
            timeout_seconds=_positive_float_setting(settings, "timeout_seconds", 10.0),
        )


@dataclass
class {prefix}Collector:
    settings: {prefix}Settings
    interval_seconds: int
    name: str = "{scaffold.key}"

    def collect(self, context: CollectorContext) -> CollectorResult:
        skip_reason = self.skip_reason()
        if skip_reason is not None:
            return CollectorResult(
                collector_name=self.name,
                status="skipped",
                message=skip_reason,
                metadata={{"provider": self.name}},
            )

        pipelines = [self._to_pipeline(item) for item in self._fetch_pipelines()]
        records_changed = 0

        if context.session is not None and not context.dry_run:
            repository = PipelineRepository(context.session)
            records_changed = sum(
                1 for pipeline in pipelines if repository.upsert_pipeline(pipeline)
            )

        return CollectorResult(
            collector_name=self.name,
            status="success",
            records_seen=len(pipelines),
            records_changed=records_changed,
            metadata={{"provider": self.name}},
        )

    def skip_reason(self) -> str | None:
        if not self.settings.base_url or self.settings.base_url.endswith(".example.invalid"):
            return "{scaffold.provider_name} base_url is not configured."
        if self.settings.token_env and os.getenv(self.settings.token_env) is None:
            return (
                "{scaffold.provider_name} credential env var "
                f"{{self.settings.token_env}} is not set."
            )
        return None

    def _fetch_pipelines(self) -> list[Mapping[str, Any]]:
        headers = {{}}
        if self.settings.token_env:
            token = os.getenv(self.settings.token_env)
            headers["Authorization"] = f"Bearer {{token}}"

        with httpx.Client(timeout=self.settings.timeout_seconds) as client:
            response = client.get(
                f"{{self.settings.base_url}}/api/pipelines",
                headers=headers,
            )
            response.raise_for_status()

        payload = response.json()
        items = payload.get("items", [])
        return [item for item in items if isinstance(item, Mapping)]

    def _to_pipeline(self, item: Mapping[str, Any]) -> Pipeline:
        source_id = str(item.get("id", item.get("name", "unknown")))
        name = str(item.get("name", source_id))

        return Pipeline(
            id=f"{{self.name}}:{{source_id}}",
            provider=self.name,
            source_id=source_id,
            name=name,
            source_url=str(item.get("url", "")),
            owner_team=str(item.get("owner_team", self.settings.default_owner_team)),
            status=str(item.get("status", "unknown")),
            last_run_status=_optional_string(item.get("last_run_status")),
            last_run_at=_parse_datetime(item.get("last_run_at")),
            last_duration_ms=_optional_int(item.get("last_duration_ms")),
            metadata={{"source": self.name}},
        )


@dataclass(frozen=True)
class {prefix}CollectorPlugin:
    name: str = "{scaffold.key}"

    def build_collectors(self, config: CollectorPluginConfig) -> Iterable[{prefix}Collector]:
        return [
            {prefix}Collector(
                settings={prefix}Settings.from_mapping(config.settings),
                interval_seconds=config.interval_seconds,
            )
        ]

    def is_configured(self, config: CollectorPluginConfig) -> bool:
        collector = {prefix}Collector(
            settings={prefix}Settings.from_mapping(config.settings),
            interval_seconds=config.interval_seconds,
        )
        return collector.skip_reason() is None


plugin = {prefix}CollectorPlugin()


def _parse_datetime(value: object) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed.astimezone(UTC) if parsed.tzinfo is not None else parsed.replace(tzinfo=UTC)


def _string_setting(
    settings: Mapping[str, object],
    key: str,
    default: str = "",
) -> str:
    value = settings.get(key, default)
    return value if isinstance(value, str) else default


def _optional_string_setting(settings: Mapping[str, object], key: str) -> str | None:
    value = settings.get(key)
    return value if isinstance(value, str) and value else None


def _optional_string(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


def _optional_int(value: object) -> int | None:
    return value if isinstance(value, int) and value >= 0 else None


def _positive_float_setting(
    settings: Mapping[str, object],
    key: str,
    default: float,
) -> float:
    value = settings.get(key, default)
    return float(value) if isinstance(value, int | float) and value > 0 else default
'''


def _collector_tests(scaffold: CollectorScaffold) -> str:
    prefix = scaffold.class_prefix
    test_prefix = scaffold.module_name.removeprefix("spaghetti_desk_")
    return f'''from __future__ import annotations

from app.collectors import CollectorContext, CollectorPluginConfig

from {scaffold.module_name} import (
    {prefix}Collector,
    {prefix}CollectorPlugin,
    {prefix}Settings,
)


def test_{test_prefix}_collector_skips_example_config() -> None:
    collector = {prefix}Collector(
        settings={prefix}Settings(
            base_url="{scaffold.example_base_url}",
            token_env=None,
            default_owner_team="Unassigned",
            timeout_seconds=10.0,
        ),
        interval_seconds=300,
    )

    result = collector.collect(CollectorContext())

    assert result.status == "skipped"
    assert "base_url is not configured" in result.message


def test_{test_prefix}_configuration_check_rejects_example_url() -> None:
    plugin = {prefix}CollectorPlugin()
    config = CollectorPluginConfig(
        name="{scaffold.key}",
        enabled=True,
        interval_seconds=300,
        settings={{"base_url": "{scaffold.example_base_url}"}},
    )

    assert plugin.is_configured(config) is False


def test_{test_prefix}_collector_normalizes_pipeline_records(monkeypatch) -> None:
    collector = {prefix}Collector(
        settings={prefix}Settings(
            base_url="https://{scaffold.key}.example.test",
            token_env=None,
            default_owner_team="Unassigned",
            timeout_seconds=10.0,
        ),
        interval_seconds=300,
    )
    monkeypatch.setattr(
        collector,
        "_fetch_pipelines",
        lambda: [
            {{
                "id": "build-main",
                "name": "Build Main",
                "url": "https://{scaffold.key}.example.test/build-main",
                "status": "healthy",
                "last_run_status": "success",
                "last_run_at": "2026-07-01T08:00:00Z",
                "last_duration_ms": 42000,
            }}
        ],
    )

    result = collector.collect(CollectorContext(dry_run=True))
    pipeline = collector._to_pipeline(collector._fetch_pipelines()[0])

    assert result.status == "success"
    assert result.records_seen == 1
    assert result.records_changed == 0
    assert pipeline.id == "{scaffold.key}:build-main"
    assert pipeline.owner_team == "Unassigned"
    assert pipeline.last_run_at is not None
'''
