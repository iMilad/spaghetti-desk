"""Collector boundary for background external-system synchronization."""
from app.collectors.base import Collector, CollectorContext, CollectorResult
from app.collectors.plugins import CollectorPluginConfig
from app.collectors.registry import CollectorRegistry

__all__ = [
    "Collector",
    "CollectorContext",
    "CollectorPluginConfig",
    "CollectorRegistry",
    "CollectorResult",
]
