from __future__ import annotations

from collections.abc import Callable

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import Session

from app.collectors.base import CollectorContext, CollectorResult
from app.collectors.registry import CollectorRegistry
from app.persistence.database import SessionLocal


def build_collector_scheduler(
    registry: CollectorRegistry,
    *,
    session_factory: Callable[[], Session] = SessionLocal,
    dry_run: bool = False,
) -> BackgroundScheduler:
    scheduler = BackgroundScheduler(timezone="UTC")
    for collector in registry.list():
        scheduler.add_job(
            _run_scheduled_collector,
            trigger="interval",
            seconds=collector.interval_seconds,
            args=[registry, collector.name, session_factory, dry_run],
            id=f"collector:{collector.name}",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
        )
    return scheduler


def _run_scheduled_collector(
    registry: CollectorRegistry,
    collector_name: str,
    session_factory: Callable[[], Session],
    dry_run: bool,
) -> CollectorResult:
    with session_factory() as session:
        result = registry.run_once(
            collector_name,
            CollectorContext(dry_run=dry_run, session=session),
        )
        session.commit()
        return result
