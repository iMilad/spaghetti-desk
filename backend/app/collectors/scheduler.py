from __future__ import annotations

from apscheduler.schedulers.background import BackgroundScheduler

from app.collectors.registry import CollectorRegistry


def build_collector_scheduler(registry: CollectorRegistry) -> BackgroundScheduler:
    scheduler = BackgroundScheduler(timezone="UTC")
    for collector in registry.list():
        scheduler.add_job(
            registry.run_once,
            trigger="interval",
            seconds=collector.interval_seconds,
            args=[collector.name],
            id=f"collector:{collector.name}",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
        )
    return scheduler
