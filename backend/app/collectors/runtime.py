from __future__ import annotations

from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass
from typing import Protocol

from app.collectors.plugins import CollectorPlugin, build_collector_registry
from app.collectors.registry import CollectorRegistry
from app.collectors.scheduler import build_collector_scheduler


class Scheduler(Protocol):
    def start(self) -> None:
        """Start scheduled collector jobs."""

    def shutdown(self, wait: bool = True) -> None:
        """Stop scheduled collector jobs."""


SchedulerFactory = Callable[..., Scheduler]


@dataclass
class CollectorRuntime:
    registry: CollectorRegistry
    scheduler: Scheduler | None = None
    started: bool = False
    dry_run: bool = False

    @property
    def collector_names(self) -> tuple[str, ...]:
        return tuple(self.registry.names())

    def shutdown(self) -> None:
        if self.scheduler is None or not self.started:
            return
        self.scheduler.shutdown(wait=False)
        self.started = False


def start_collector_runtime(
    raw_config: Mapping[str, object],
    *,
    plugins: Iterable[CollectorPlugin] | None = None,
    scheduler_factory: SchedulerFactory = build_collector_scheduler,
) -> CollectorRuntime:
    registry = build_collector_registry(raw_config, plugins=plugins)
    collector_settings = _collector_settings(raw_config)
    globally_enabled = _as_bool(collector_settings.get("enabled"), default=False)
    if not globally_enabled:
        return CollectorRuntime(registry=registry)

    collector_names = tuple(registry.names())
    if not collector_names:
        return CollectorRuntime(registry=registry)

    dry_run = not _as_bool(collector_settings.get("write_to_local_inventory"), default=True)
    scheduler = scheduler_factory(registry, dry_run=dry_run)
    scheduler.start()
    return CollectorRuntime(
        registry=registry,
        scheduler=scheduler,
        started=True,
        dry_run=dry_run,
    )


def _collector_settings(raw_config: Mapping[str, object]) -> Mapping[str, object]:
    collectors = raw_config.get("collectors")
    return collectors if isinstance(collectors, Mapping) else {}


def _as_bool(value: object, *, default: bool) -> bool:
    return value if isinstance(value, bool) else default
