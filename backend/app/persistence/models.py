from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.persistence.base import Base


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class ServiceRecord(TimestampMixin, Base):
    __tablename__ = "services"
    __table_args__ = (
        Index("ix_services_status_owner_team", "status", "owner_team"),
        Index("ix_services_host_id", "host_id"),
        Index("ix_services_license_id", "license_id"),
    )

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    service_type: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    owner_team: Mapped[str] = mapped_column(String(120), nullable=False)
    lifecycle: Mapped[str] = mapped_column(String(40), nullable=False)
    version: Mapped[str] = mapped_column(String(80), nullable=False)
    example_url: Mapped[str] = mapped_column(String(500), nullable=False)
    host_id: Mapped[str] = mapped_column(String(80), nullable=False)
    license_id: Mapped[str | None] = mapped_column(ForeignKey("licenses.id"), nullable=True)
    backup_status: Mapped[str] = mapped_column(String(40), nullable=False)
    monitoring_status: Mapped[str] = mapped_column(String(40), nullable=False)
    last_maintenance: Mapped[date] = mapped_column(Date, nullable=False)
    documentation_url: Mapped[str] = mapped_column(String(500), nullable=False)
    known_risks: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)


class VMRecord(TimestampMixin, Base):
    __tablename__ = "vms"
    __table_args__ = (
        Index("ix_vms_team_review_status", "team", "review_status"),
        Index("ix_vms_environment", "environment"),
        Index("ix_vms_last_seen_at", "last_seen_at"),
    )

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    ip_address: Mapped[str] = mapped_column(String(64), nullable=False)
    owner: Mapped[str] = mapped_column(String(160), nullable=False)
    team: Mapped[str] = mapped_column(String(120), nullable=False)
    purpose: Mapped[str] = mapped_column(Text, nullable=False)
    environment: Mapped[str] = mapped_column(String(40), nullable=False)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    cpu: Mapped[int] = mapped_column(Integer, nullable=False)
    ram_gb: Mapped[int] = mapped_column(Integer, nullable=False)
    disk_gb: Mapped[int] = mapped_column(Integer, nullable=False)
    os: Mapped[str] = mapped_column(String(120), nullable=False)
    created_on: Mapped[date] = mapped_column(Date, nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    patch_status: Mapped[str] = mapped_column(String(40), nullable=False)
    ownership_confidence: Mapped[str] = mapped_column(String(40), nullable=False)
    review_status: Mapped[str] = mapped_column(String(40), nullable=False)


class LicenseRecord(TimestampMixin, Base):
    __tablename__ = "licenses"
    __table_args__ = (
        Index("ix_licenses_owner_team_renewal_status", "owner_team", "renewal_status"),
        Index("ix_licenses_expires_on", "expires_on"),
    )

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    vendor: Mapped[str] = mapped_column(String(160), nullable=False)
    category: Mapped[str] = mapped_column(String(80), nullable=False)
    owner_team: Mapped[str] = mapped_column(String(120), nullable=False)
    expires_on: Mapped[date] = mapped_column(Date, nullable=False)
    renewal_status: Mapped[str] = mapped_column(String(40), nullable=False)
    risk: Mapped[str] = mapped_column(Text, nullable=False)


class PermissionRecord(TimestampMixin, Base):
    __tablename__ = "permissions"
    __table_args__ = (
        Index("ix_permissions_system_risk_level", "system", "risk_level"),
        Index("ix_permissions_principal", "principal"),
    )

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    principal: Mapped[str] = mapped_column(String(240), nullable=False)
    system: Mapped[str] = mapped_column(String(120), nullable=False)
    role: Mapped[str] = mapped_column(String(120), nullable=False)
    risk_level: Mapped[str] = mapped_column(String(40), nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class AgentSessionRecord(TimestampMixin, Base):
    __tablename__ = "agent_sessions"
    __table_args__ = (
        Index("ix_agent_sessions_status_started_at", "status", "started_at"),
        Index("ix_agent_sessions_target", "target"),
        Index("ix_agent_sessions_operator", "operator"),
    )

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    operator: Mapped[str] = mapped_column(String(160), nullable=False)
    target: Mapped[str] = mapped_column(String(200), nullable=False)
    task_summary: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    files_changed: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    commands_run: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    approval_required: Mapped[bool] = mapped_column(Boolean, nullable=False)
    outcome: Mapped[str] = mapped_column(Text, nullable=False)


class ActionLogRecord(TimestampMixin, Base):
    __tablename__ = "action_logs"
    __table_args__ = (
        Index("ix_action_logs_approval_requested_at", "approval_status", "requested_at"),
        Index("ix_action_logs_execution_requested_at", "execution_status", "requested_at"),
        Index("ix_action_logs_target", "target_system", "target_type", "target_id"),
        Index("ix_action_logs_requested_by", "requested_by"),
    )

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    action_type: Mapped[str] = mapped_column(String(120), nullable=False)
    target_system: Mapped[str] = mapped_column(String(120), nullable=False)
    target_type: Mapped[str] = mapped_column(String(80), nullable=False)
    target_id: Mapped[str] = mapped_column(String(160), nullable=False)
    requested_by: Mapped[str] = mapped_column(String(160), nullable=False)
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    approval_status: Mapped[str] = mapped_column(String(40), nullable=False)
    approved_by: Mapped[str | None] = mapped_column(String(160), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    execution_status: Mapped[str] = mapped_column(String(40), nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    risk_level: Mapped[str] = mapped_column(String(40), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    sanitized_parameters: Mapped[dict[str, str]] = mapped_column(JSON, default=dict, nullable=False)
    before_state: Mapped[dict[str, str]] = mapped_column(JSON, default=dict, nullable=False)
    after_state: Mapped[dict[str, str]] = mapped_column(JSON, default=dict, nullable=False)
    result_summary: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_links: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)


class PipelineRecord(TimestampMixin, Base):
    __tablename__ = "pipelines"
    __table_args__ = (
        Index("ix_pipelines_provider_status", "provider", "status"),
        Index("ix_pipelines_owner_team", "owner_team"),
        Index("ix_pipelines_last_run_at", "last_run_at"),
    )

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    provider: Mapped[str] = mapped_column(String(80), nullable=False)
    source_id: Mapped[str] = mapped_column(String(240), nullable=False)
    name: Mapped[str] = mapped_column(String(240), nullable=False)
    source_url: Mapped[str] = mapped_column(String(500), nullable=False)
    owner_team: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    last_run_status: Mapped[str | None] = mapped_column(String(40), nullable=True)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    metadata_json: Mapped[dict[str, str]] = mapped_column(
        "metadata",
        JSON,
        default=dict,
        nullable=False,
    )


class CollectorRunRecord(Base):
    __tablename__ = "collector_runs"
    __table_args__ = (
        Index("ix_collector_runs_collector_started_at", "collector_name", "started_at"),
        Index("ix_collector_runs_status_started_at", "status", "started_at"),
    )

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    run_id: Mapped[str] = mapped_column(String(80), nullable=False)
    collector_name: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    dry_run: Mapped[bool] = mapped_column(Boolean, nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    records_seen: Mapped[int] = mapped_column(Integer, nullable=False)
    records_changed: Mapped[int] = mapped_column(Integer, nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_json: Mapped[dict[str, str]] = mapped_column(
        "metadata",
        JSON,
        default=dict,
        nullable=False,
    )
