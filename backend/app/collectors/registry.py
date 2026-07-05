from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, datetime
from time import perf_counter

from app.collectors.base import Collector, CollectorContext, CollectorResult


class CollectorRegistry:
    def __init__(self) -> None:
        self._collectors: dict[str, Collector] = {}

    def register(self, collector: Collector) -> None:
        if collector.name in self._collectors:
            raise ValueError(f"collector {collector.name!r} is already registered")
        if collector.interval_seconds <= 0:
            raise ValueError("collector interval_seconds must be positive")
        self._collectors[collector.name] = collector

    def get(self, name: str) -> Collector:
        return self._collectors[name]

    def list(self) -> list[Collector]:
        return list(self._collectors.values())

    def run_once(
        self,
        name: str,
        context: CollectorContext | None = None,
    ) -> CollectorResult:
        collector = self.get(name)
        started = perf_counter()
        run_context = context or CollectorContext()

        try:
            result = collector.collect(run_context)
        except Exception as exc:  # noqa: BLE001
            result = CollectorResult(
                collector_name=collector.name,
                status="failed",
                duration_ms=_elapsed_ms(started),
                message=str(exc),
                finished_at=datetime.now(UTC),
            )
            _record_result(run_context, result)
            return result

        normalized_result = CollectorResult(
            collector_name=result.collector_name,
            status=result.status,
            records_seen=result.records_seen,
            records_changed=result.records_changed,
            duration_ms=result.duration_ms or _elapsed_ms(started),
            message=result.message,
            metadata=result.metadata,
            finished_at=result.finished_at or datetime.now(UTC),
        )
        _record_result(run_context, normalized_result)
        return normalized_result

    def run_all(self, context: CollectorContext | None = None) -> list[CollectorResult]:
        run_context = context or CollectorContext()
        return [self.run_once(collector.name, run_context) for collector in self.list()]

    def names(self) -> Iterable[str]:
        return self._collectors.keys()


def _elapsed_ms(started: float) -> int:
    return max(0, round((perf_counter() - started) * 1000))


def _record_result(context: CollectorContext, result: CollectorResult) -> None:
    if context.session is None:
        return

    from app.persistence.repositories import CollectorRunRepository

    CollectorRunRepository(context.session).record_result(context=context, result=result)
