from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Literal, Protocol
from uuid import uuid4

from sqlalchemy.orm import Session

CollectorStatus = Literal["success", "skipped", "failed"]


@dataclass(frozen=True)
class CollectorContext:
    run_id: str = field(default_factory=lambda: str(uuid4()))
    started_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    dry_run: bool = True
    config: Mapping[str, object] = field(default_factory=dict)
    session: Session | None = None


@dataclass(frozen=True)
class CollectorResult:
    collector_name: str
    status: CollectorStatus
    records_seen: int = 0
    records_changed: int = 0
    duration_ms: int = 0
    message: str = ""
    metadata: Mapping[str, str] = field(default_factory=dict)
    finished_at: datetime | None = None


class Collector(Protocol):
    name: str
    interval_seconds: int

    def collect(self, context: CollectorContext) -> CollectorResult:
        """Collect external state into local inventory storage."""
