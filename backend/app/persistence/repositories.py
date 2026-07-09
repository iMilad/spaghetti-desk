from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.collectors.base import CollectorContext, CollectorResult
from app.models import VM, ActionLog, CollectorRun, Pipeline, Service
from app.persistence.models import (
    ActionLogRecord,
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


class ActionLogRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_action_logs(
        self,
        *,
        limit: int,
        offset: int,
        approval_status: str | None = None,
        execution_status: str | None = None,
        target_system: str | None = None,
    ) -> PageResult[ActionLog]:
        filters = _filters(
            (ActionLogRecord.approval_status, approval_status),
            (ActionLogRecord.execution_status, execution_status),
            (ActionLogRecord.target_system, target_system),
        )
        total = _count(self._session, ActionLogRecord, filters)
        records = self._session.scalars(
            select(ActionLogRecord)
            .where(*filters)
            .order_by(ActionLogRecord.requested_at.desc())
            .limit(limit)
            .offset(offset)
        ).all()

        return PageResult(
            total=total,
            items=[action_log_from_record(record) for record in records],
        )

    def record_action_log(self, action_log: ActionLog) -> ActionLog:
        record = ActionLogRecord(
            id=action_log.id,
            action_type=action_log.action_type,
            target_system=action_log.target_system,
            target_type=action_log.target_type,
            target_id=action_log.target_id,
            requested_by=action_log.requested_by,
            requested_at=action_log.requested_at,
            approval_status=action_log.approval_status,
            approved_by=action_log.approved_by,
            approved_at=action_log.approved_at,
            execution_status=action_log.execution_status,
            started_at=action_log.started_at,
            finished_at=action_log.finished_at,
            duration_ms=action_log.duration_ms,
            risk_level=action_log.risk_level,
            summary=action_log.summary,
            sanitized_parameters=dict(action_log.sanitized_parameters),
            before_state=dict(action_log.before_state),
            after_state=dict(action_log.after_state),
            result_summary=action_log.result_summary,
            evidence_links=list(action_log.evidence_links),
        )
        self._session.merge(record)
        return action_log_from_record(record)


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

    def latest_runs_by_collector(
        self,
        collector_names: Iterable[str],
    ) -> dict[str, CollectorRun]:
        names = sorted(set(collector_names))
        if not names:
            return {}

        ranked = (
            select(
                CollectorRunRecord.id,
                func.row_number()
                .over(
                    partition_by=CollectorRunRecord.collector_name,
                    order_by=CollectorRunRecord.started_at.desc(),
                )
                .label("rank"),
            )
            .where(CollectorRunRecord.collector_name.in_(names))
            .subquery()
        )
        records = self._session.scalars(
            select(CollectorRunRecord)
            .join(ranked, CollectorRunRecord.id == ranked.c.id)
            .where(ranked.c.rank == 1)
        ).all()

        return {
            record.collector_name: collector_run_from_record(record)
            for record in records
        }


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


def action_log_from_record(record: ActionLogRecord) -> ActionLog:
    return ActionLog(
        id=record.id,
        action_type=record.action_type,
        target_system=record.target_system,
        target_type=record.target_type,
        target_id=record.target_id,
        requested_by=record.requested_by,
        requested_at=record.requested_at,
        approval_status=record.approval_status,
        approved_by=record.approved_by,
        approved_at=record.approved_at,
        execution_status=record.execution_status,
        started_at=record.started_at,
        finished_at=record.finished_at,
        duration_ms=record.duration_ms,
        risk_level=record.risk_level,
        summary=record.summary,
        sanitized_parameters=dict(record.sanitized_parameters or {}),
        before_state=dict(record.before_state or {}),
        after_state=dict(record.after_state or {}),
        result_summary=record.result_summary,
        evidence_links=list(record.evidence_links or []),
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
