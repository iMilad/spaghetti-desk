from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.collectors.base import CollectorContext, CollectorResult
from app.models import VM, CollectorRun, Pipeline, Service
from app.persistence.models import (
    CollectorRunRecord,
    PipelineRecord,
    ServiceRecord,
    VMRecord,
)


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


class PipelineRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_pipelines(
        self,
        *,
        limit: int,
        offset: int,
        provider: str | None = None,
        status: str | None = None,
        owner_team: str | None = None,
    ) -> PageResult[Pipeline]:
        filters = _filters(
            (PipelineRecord.provider, provider),
            (PipelineRecord.status, status),
            (PipelineRecord.owner_team, owner_team),
        )
        total = _count(self._session, PipelineRecord, filters)
        records = self._session.scalars(
            select(PipelineRecord)
            .where(*filters)
            .order_by(PipelineRecord.name)
            .limit(limit)
            .offset(offset)
        ).all()

        return PageResult(
            total=total,
            items=[pipeline_from_record(record) for record in records],
        )

    def upsert_pipeline(self, pipeline: Pipeline) -> bool:
        record = self._session.get(PipelineRecord, pipeline.id)
        if record is None:
            self._session.add(
                PipelineRecord(
                    id=pipeline.id,
                    provider=pipeline.provider,
                    source_id=pipeline.source_id,
                    name=pipeline.name,
                    source_url=pipeline.source_url,
                    owner_team=pipeline.owner_team,
                    status=pipeline.status,
                    last_run_status=pipeline.last_run_status,
                    last_run_at=pipeline.last_run_at,
                    last_duration_ms=pipeline.last_duration_ms,
                    metadata_json=dict(pipeline.metadata),
                )
            )
            return True

        changed = _update_if_changed(
            record,
            {
                "provider": pipeline.provider,
                "source_id": pipeline.source_id,
                "name": pipeline.name,
                "source_url": pipeline.source_url,
                "owner_team": pipeline.owner_team,
                "status": pipeline.status,
                "last_run_status": pipeline.last_run_status,
                "last_run_at": pipeline.last_run_at,
                "last_duration_ms": pipeline.last_duration_ms,
                "metadata_json": dict(pipeline.metadata),
            },
        )
        return changed


class CollectorRunRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def record_result(
        self,
        *,
        context: CollectorContext,
        result: CollectorResult,
    ) -> CollectorRun:
        record = CollectorRunRecord(
            id=f"{context.run_id}:{result.collector_name}",
            run_id=context.run_id,
            collector_name=result.collector_name,
            status=result.status,
            dry_run=context.dry_run,
            started_at=context.started_at,
            finished_at=result.finished_at,
            duration_ms=result.duration_ms,
            records_seen=result.records_seen,
            records_changed=result.records_changed,
            message=result.message,
            metadata_json=dict(result.metadata),
        )
        self._session.merge(record)
        return collector_run_from_record(record)

    def list_runs(
        self,
        *,
        limit: int,
        offset: int,
        collector_name: str | None = None,
        status: str | None = None,
    ) -> PageResult[CollectorRun]:
        filters = _filters(
            (CollectorRunRecord.collector_name, collector_name),
            (CollectorRunRecord.status, status),
        )
        total = _count(self._session, CollectorRunRecord, filters)
        records = self._session.scalars(
            select(CollectorRunRecord)
            .where(*filters)
            .order_by(CollectorRunRecord.started_at.desc())
            .limit(limit)
            .offset(offset)
        ).all()

        return PageResult(
            total=total,
            items=[collector_run_from_record(record) for record in records],
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


def pipeline_from_record(record: PipelineRecord) -> Pipeline:
    return Pipeline(
        id=record.id,
        provider=record.provider,
        source_id=record.source_id,
        name=record.name,
        source_url=record.source_url,
        owner_team=record.owner_team,
        status=record.status,
        last_run_status=record.last_run_status,
        last_run_at=record.last_run_at,
        last_duration_ms=record.last_duration_ms,
        metadata=dict(record.metadata_json or {}),
    )


def collector_run_from_record(record: CollectorRunRecord) -> CollectorRun:
    return CollectorRun(
        id=record.id,
        run_id=record.run_id,
        collector_name=record.collector_name,
        status=record.status,
        dry_run=record.dry_run,
        started_at=record.started_at,
        finished_at=record.finished_at,
        duration_ms=record.duration_ms,
        records_seen=record.records_seen,
        records_changed=record.records_changed,
        message=record.message,
        metadata=dict(record.metadata_json or {}),
    )


def _filters(*pairs):
    return [column == value for column, value in pairs if value is not None]


def _count(session: Session, model, filters: Sequence) -> int:
    statement: Select[tuple[int]] = select(func.count()).select_from(model).where(*filters)
    return session.scalar(statement) or 0


def _update_if_changed(record, values: dict[str, object]) -> bool:
    changed = False
    for field_name, value in values.items():
        if getattr(record, field_name) != value:
            setattr(record, field_name, value)
            changed = True
    return changed
