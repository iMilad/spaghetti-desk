from __future__ import annotations

from dataclasses import dataclass

import pytest

from app.collectors import CollectorContext, CollectorRegistry, CollectorResult
from app.collectors.scheduler import build_collector_scheduler


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


def test_collector_registry_runs_registered_collector() -> None:
    registry = CollectorRegistry()
    registry.register(StubCollector())
    context = CollectorContext(run_id="test-run")

    result = registry.run_once("stub", context)

    assert result.status == "success"
    assert result.records_seen == 2
    assert result.records_changed == 1
    assert result.metadata["run_id"] == "test-run"


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
