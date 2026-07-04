from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.models import VM, Service
from app.persistence.models import ServiceRecord, VMRecord


@dataclass(frozen=True)
class PageResult[ItemT]:
    total: int
    items: list[ItemT]


class ServiceRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_services(
        self,
        *,
        limit: int,
        offset: int,
        status: str | None = None,
        owner_team: str | None = None,
    ) -> PageResult[Service]:
        filters = _filters(
            (ServiceRecord.status, status),
            (ServiceRecord.owner_team, owner_team),
        )
        total = _count(self._session, ServiceRecord, filters)
        records = self._session.scalars(
            select(ServiceRecord)
            .where(*filters)
            .order_by(ServiceRecord.name)
            .limit(limit)
            .offset(offset)
        ).all()

        return PageResult(
            total=total,
            items=[service_from_record(record) for record in records],
        )


class VMRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_vms(
        self,
        *,
        limit: int,
        offset: int,
        team: str | None = None,
        review_status: str | None = None,
        ownership_confidence: str | None = None,
    ) -> PageResult[VM]:
        filters = _filters(
            (VMRecord.team, team),
            (VMRecord.review_status, review_status),
            (VMRecord.ownership_confidence, ownership_confidence),
        )
        total = _count(self._session, VMRecord, filters)
        records = self._session.scalars(
            select(VMRecord)
            .where(*filters)
            .order_by(VMRecord.name)
            .limit(limit)
            .offset(offset)
        ).all()

        return PageResult(
            total=total,
            items=[vm_from_record(record) for record in records],
        )


def service_from_record(record: ServiceRecord) -> Service:
    return Service(
        id=record.id,
        name=record.name,
        service_type=record.service_type,
        status=record.status,
        owner_team=record.owner_team,
        lifecycle=record.lifecycle,
        version=record.version,
        example_url=record.example_url,
        host_id=record.host_id,
        license_id=record.license_id,
        backup_status=record.backup_status,
        monitoring_status=record.monitoring_status,
        last_maintenance=record.last_maintenance,
        documentation_url=record.documentation_url,
        known_risks=list(record.known_risks or []),
    )


def vm_from_record(record: VMRecord) -> VM:
    return VM(
        id=record.id,
        name=record.name,
        ip_address=record.ip_address,
        owner=record.owner,
        team=record.team,
        purpose=record.purpose,
        environment=record.environment,
        tags=list(record.tags or []),
        cpu=record.cpu,
        ram_gb=record.ram_gb,
        disk_gb=record.disk_gb,
        os=record.os,
        created_on=record.created_on,
        last_seen_at=record.last_seen_at,
        patch_status=record.patch_status,
        ownership_confidence=record.ownership_confidence,
        review_status=record.review_status,
    )


def _filters(*pairs):
    return [column == value for column, value in pairs if value is not None]


def _count(session: Session, model, filters: Sequence) -> int:
    statement: Select[tuple[int]] = select(func.count()).select_from(model).where(*filters)
    return session.scalar(statement) or 0
