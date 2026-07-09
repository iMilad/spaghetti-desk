# Install and Configure a Collector

Collectors are optional Python packages. A deployment installs only the
collectors it needs, then enables each collector in private local config. The
core app discovers installed packages through Python entry points and reads
collector output from the local database.

This page shows a generic CI collector. Replace `example_ci` with your own
tool name, or generate the same package shape:

```bash
scripts/scaffold-collector example-ci
```

## 1. Create the Package

Recommended package layout:

```text
plugins/example-ci/
  pyproject.toml
  README.md
  spaghetti_desk_example_ci/
    __init__.py
  tests/
    test_example_ci_collector.py
```

`pyproject.toml`:

```toml
[build-system]
requires = ["setuptools>=70"]
build-backend = "setuptools.build_meta"

[project]
name = "spaghetti-desk-collector-example-ci"
version = "0.1.0"
description = "Optional Example CI collector plugin for Spaghetti Desk."
requires-python = ">=3.12"
dependencies = [
  "httpx>=0.27,<1",
  "spaghetti-desk-backend>=0.2.0",
]

[project.entry-points."spaghetti_desk.collectors"]
example-ci = "spaghetti_desk_example_ci:plugin"

[tool.setuptools.packages.find]
include = ["spaghetti_desk_example_ci*"]
```

The entry point name, `example-ci`, is the collector key used in config and in
the Plugin Registry.

## 2. Implement the Plugin

`spaghetti_desk_example_ci/__init__.py`:

```python
from __future__ import annotations

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
class ExampleCISettings:
    base_url: str
    token_env: str | None
    default_owner_team: str
    timeout_seconds: float

    @classmethod
    def from_mapping(cls, settings: Mapping[str, object]) -> ExampleCISettings:
        return cls(
            base_url=str(settings.get("base_url", "")).rstrip("/"),
            token_env=_optional_string(settings.get("token_env")),
            default_owner_team=str(settings.get("default_owner_team", "Unassigned")),
            timeout_seconds=_positive_float(settings.get("timeout_seconds"), 10.0),
        )


@dataclass
class ExampleCICollector:
    settings: ExampleCISettings
    interval_seconds: int
    name: str = "example-ci"

    def collect(self, context: CollectorContext) -> CollectorResult:
        skip_reason = self.skip_reason()
        if skip_reason is not None:
            return CollectorResult(
                collector_name=self.name,
                status="skipped",
                message=skip_reason,
                metadata={"provider": self.name},
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
            metadata={"provider": self.name},
        )

    def skip_reason(self) -> str | None:
        if not self.settings.base_url or self.settings.base_url.endswith(".example.invalid"):
            return "Example CI base_url is not configured."
        if self.settings.token_env and os.getenv(self.settings.token_env) is None:
            return f"Example CI credential env var {self.settings.token_env} is not set."
        return None

    def _fetch_pipelines(self) -> list[Mapping[str, Any]]:
        headers = {}
        if self.settings.token_env:
            token = os.getenv(self.settings.token_env)
            headers["Authorization"] = f"Bearer {token}"

        with httpx.Client(timeout=self.settings.timeout_seconds) as client:
            response = client.get(f"{self.settings.base_url}/api/pipelines", headers=headers)
            response.raise_for_status()

        payload = response.json()
        items = payload.get("items", [])
        return [item for item in items if isinstance(item, Mapping)]

    def _to_pipeline(self, item: Mapping[str, Any]) -> Pipeline:
        source_id = str(item.get("id", item.get("name", "unknown")))
        name = str(item.get("name", source_id))
        last_run = item.get("last_run_at")
        parsed_last_run = (
            datetime.fromisoformat(last_run.replace("Z", "+00:00"))
            if isinstance(last_run, str) and last_run
            else None
        )
        last_run_at = (
            parsed_last_run.astimezone(UTC)
            if parsed_last_run is not None and parsed_last_run.tzinfo is not None
            else parsed_last_run.replace(tzinfo=UTC)
            if parsed_last_run is not None
            else None
        )

        return Pipeline(
            id=f"{self.name}:{source_id}",
            provider=self.name,
            source_id=source_id,
            name=name,
            source_url=str(item.get("url", "")),
            owner_team=str(item.get("owner_team", self.settings.default_owner_team)),
            status=str(item.get("status", "unknown")),
            last_run_status=_optional_string(item.get("last_run_status")),
            last_run_at=last_run_at,
            last_duration_ms=_optional_int(item.get("last_duration_ms")),
            metadata={"source": self.name},
        )


@dataclass(frozen=True)
class ExampleCICollectorPlugin:
    name: str = "example-ci"

    def build_collectors(self, config: CollectorPluginConfig) -> Iterable[ExampleCICollector]:
        return [
            ExampleCICollector(
                settings=ExampleCISettings.from_mapping(config.settings),
                interval_seconds=config.interval_seconds,
            )
        ]

    def is_configured(self, config: CollectorPluginConfig) -> bool:
        collector = ExampleCICollector(
            settings=ExampleCISettings.from_mapping(config.settings),
            interval_seconds=config.interval_seconds,
        )
        return collector.skip_reason() is None


plugin = ExampleCICollectorPlugin()


def _optional_string(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


def _optional_int(value: object) -> int | None:
    return value if isinstance(value, int) and value >= 0 else None


def _positive_float(value: object, default: float) -> float:
    return float(value) if isinstance(value, int | float) and value > 0 else default
```

## 3. Install It

For a local plugin in this repository:

```bash
cd backend
uv pip install -e ../plugins/example-ci
```

For a company-private plugin outside this public repository:

```bash
cd backend
uv pip install -e /path/to/private/spaghetti-desk-collector-example-ci
```

After installation, restart the backend. The collector should appear as
installed in the Collectors Plugin Registry.

## 4. Configure It

Put real endpoints, credentials, and mappings in ignored local config, not in
the public repo:

```yaml
collectors:
  enabled: true
  plugins:
    example-ci:
      enabled: true
      interval_seconds: 300
      base_url: ${EXAMPLE_CI_URL}
      token_env: EXAMPLE_CI_TOKEN
      default_owner_team: Unassigned
      timeout_seconds: 10
```

Required behavior:

- `collectors.enabled` must be `true` before any collector is scheduled.
- The plugin key must match the entry point name, here `example-ci`.
- Secrets should be referenced by environment variable name, not stored in YAML.
- `is_configured(config)` should return `false` for missing or example config.

## 5. Test It

Use unit tests that stub external calls. Do not call real company services from
normal tests.

Minimum checks:

- example config returns a skipped result
- missing credential environment variables return a skipped result
- fetched records normalize into local `Pipeline` models
- dry runs do not write to the database
- non-dry runs upsert records idempotently
- `is_configured(config)` matches the Plugin Registry state

## Public Safety Checklist

Before publishing or opening a pull request:

- No real hostnames, IPs, usernames, emails, tokens, job names, or team mappings.
- Use `.example.invalid` URLs in public examples.
- Keep private config in `config/local.yaml` or another ignored deployment file.
- Keep company-specific plugins in a private repository unless they are fully
  sanitized.
- Ensure normal UI/API page rendering reads local database state and does not
  call external systems live.
