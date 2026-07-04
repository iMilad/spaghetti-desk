from __future__ import annotations

from collections.abc import Iterable
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
            return CollectorResult(
                collector_name=collector.name,
                status="failed",
                duration_ms=_elapsed_ms(started),
                message=str(exc),
            )

        return CollectorResult(
            collector_name=result.collector_name,
            status=result.status,
            records_seen=result.records_seen,
            records_changed=result.records_changed,
            duration_ms=result.duration_ms or _elapsed_ms(started),
            message=result.message,
            metadata=result.metadata,
        )

    def run_all(self, context: CollectorContext | None = None) -> list[CollectorResult]:
        run_context = context or CollectorContext()
        return [self.run_once(collector.name, run_context) for collector in self.list()]

    def names(self) -> Iterable[str]:
        return self._collectors.keys()


def _elapsed_ms(started: float) -> int:
    return max(0, round((perf_counter() - started) * 1000))
