"""Collector boundary for background external-system synchronization."""
from app.collectors.base import Collector, CollectorContext, CollectorResult
from app.collectors.registry import CollectorRegistry

__all__ = [
    "Collector",
    "CollectorContext",
    "CollectorRegistry",
    "CollectorResult",
]
