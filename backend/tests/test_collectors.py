from __future__ import annotations

from dataclasses import dataclass

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.collectors import (
    CollectorContext,
    CollectorPluginConfig,
    CollectorRegistry,
    CollectorResult,
)
from app.collectors.plugins import build_collector_registry, list_collector_plugin_status
from app.collectors.runtime import start_collector_runtime
from app.collectors.scheduler import build_collector_scheduler
from app.persistence.base import Base
from app.persistence.models import CollectorRunRecord


@dataclass
class StubCollector:
    name: str = "stub"
    interval_seconds: int = 60

    def collect(self, context: CollectorContext) -> CollectorResult:
        return CollectorResult(
            collector_name=self.name,
            status="success",
            records_seen=2,
            records_changed=1,
            metadata={"run_id": context.run_id},
        )


@dataclass
class FailingCollector:
    name: str = "failing"
    interval_seconds: int = 60

    def collect(self, context: CollectorContext) -> CollectorResult:
        raise RuntimeError(f"collector failed in {context.run_id}")


@dataclass
class StubPlugin:
    name: str = "stub"

    def build_collectors(self, config: CollectorPluginConfig):
        return [StubCollector(interval_seconds=config.interval_seconds)]


@dataclass
class StubScheduler:
    started: bool = False
    stopped: bool = False
    dry_run: bool = False

    def start(self) -> None:
        self.started = True

    def shutdown(self, wait: bool = True) -> None:
        self.stopped = True


def test_collector_registry_runs_registered_collector() -> None:
    registry = CollectorRegistry()
    registry.register(StubCollector())
    context = CollectorContext(run_id="test-run")

    result = registry.run_once("stub", context)

    assert result.status == "success"
    assert result.records_seen == 2
    assert result.records_changed == 1
    assert result.metadata["run_id"] == "test-run"


def test_collector_registry_records_run_when_session_is_provided() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    registry = CollectorRegistry()
    registry.register(StubCollector())

    with Session(engine) as session:
        result = registry.run_once(
            "stub",
            CollectorContext(run_id="test-run", session=session),
        )
        session.commit()
        record = session.get(CollectorRunRecord, "test-run:stub")

    assert result.status == "success"
    assert record is not None
    assert record.records_seen == 2


def test_collector_registry_rejects_duplicate_names() -> None:
    registry = CollectorRegistry()
    registry.register(StubCollector())

    with pytest.raises(ValueError, match="already registered"):
        registry.register(StubCollector())


def test_collector_registry_returns_failed_result_on_exception() -> None:
    registry = CollectorRegistry()
    registry.register(FailingCollector())

    result = registry.run_once("failing", CollectorContext(run_id="test-run"))

    assert result.status == "failed"
    assert result.collector_name == "failing"
    assert "test-run" in result.message


def test_collector_scheduler_registers_interval_jobs() -> None:
    registry = CollectorRegistry()
    registry.register(StubCollector(name="one", interval_seconds=30))
    registry.register(StubCollector(name="two", interval_seconds=45))

    scheduler = build_collector_scheduler(registry)

    assert {job.id for job in scheduler.get_jobs()} == {"collector:one", "collector:two"}


def test_collector_plugins_are_disabled_until_global_and_plugin_config_enable_them() -> None:
    raw_config = {
        "collectors": {
            "enabled": False,
            "default_interval_seconds": 90,
            "plugins": {
                "stub": {
                    "enabled": True,
                    "interval_seconds": 30,
                }
            },
        }
    }

    registry = build_collector_registry(raw_config, plugins=[StubPlugin()])
    statuses = list_collector_plugin_status(raw_config, plugins=[StubPlugin()])

    assert list(registry.names()) == []
    assert statuses[0].installed is True
    assert statuses[0].enabled is False

    raw_config["collectors"]["enabled"] = True
    registry = build_collector_registry(raw_config, plugins=[StubPlugin()])
    statuses = list_collector_plugin_status(raw_config, plugins=[StubPlugin()])

    assert list(registry.names()) == ["stub"]
    assert registry.get("stub").interval_seconds == 30
    assert statuses[0].enabled is True


def test_collector_runtime_does_not_start_scheduler_when_global_config_is_disabled() -> None:
    raw_config = {
        "collectors": {
            "enabled": False,
            "plugins": {
                "stub": {
                    "enabled": True,
                    "interval_seconds": 30,
                }
            },
        }
    }

    runtime = start_collector_runtime(
        raw_config,
        plugins=[StubPlugin()],
        scheduler_factory=lambda registry, dry_run: StubScheduler(dry_run=dry_run),
    )

    assert runtime.started is False
    assert runtime.scheduler is None
    assert runtime.collector_names == ()


def test_collector_runtime_starts_scheduler_for_enabled_installed_collectors() -> None:
    raw_config = {
        "collectors": {
            "enabled": True,
            "write_to_local_inventory": False,
            "plugins": {
                "stub": {
                    "enabled": True,
                    "interval_seconds": 30,
                }
            },
        }
    }
    scheduler = StubScheduler()

    runtime = start_collector_runtime(
        raw_config,
        plugins=[StubPlugin()],
        scheduler_factory=lambda registry, dry_run: _configure_scheduler(
            scheduler,
            dry_run=dry_run,
        ),
    )

    assert runtime.started is True
    assert runtime.collector_names == ("stub",)
    assert runtime.dry_run is True
    assert scheduler.started is True
    assert scheduler.dry_run is True

    runtime.shutdown()

    assert runtime.started is False
    assert scheduler.stopped is True


def _configure_scheduler(scheduler: StubScheduler, *, dry_run: bool) -> StubScheduler:
    scheduler.dry_run = dry_run
    return scheduler
