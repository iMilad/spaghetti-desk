"""create inventory tables

Revision ID: 20260704_0001
Revises:
Create Date: 2026-07-04 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260704_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "licenses",
        sa.Column("id", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("vendor", sa.String(length=160), nullable=False),
        sa.Column("category", sa.String(length=80), nullable=False),
        sa.Column("owner_team", sa.String(length=120), nullable=False),
        sa.Column("expires_on", sa.Date(), nullable=False),
        sa.Column("renewal_status", sa.String(length=40), nullable=False),
        sa.Column("risk", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_licenses_expires_on", "licenses", ["expires_on"])
    op.create_index(
        "ix_licenses_owner_team_renewal_status",
        "licenses",
        ["owner_team", "renewal_status"],
    )

    op.create_table(
        "services",
        sa.Column("id", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("service_type", sa.String(length=80), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("owner_team", sa.String(length=120), nullable=False),
        sa.Column("lifecycle", sa.String(length=40), nullable=False),
        sa.Column("version", sa.String(length=80), nullable=False),
        sa.Column("example_url", sa.String(length=500), nullable=False),
        sa.Column("host_id", sa.String(length=80), nullable=False),
        sa.Column("license_id", sa.String(length=80), nullable=True),
        sa.Column("backup_status", sa.String(length=40), nullable=False),
        sa.Column("monitoring_status", sa.String(length=40), nullable=False),
        sa.Column("last_maintenance", sa.Date(), nullable=False),
        sa.Column("documentation_url", sa.String(length=500), nullable=False),
        sa.Column("known_risks", sa.JSON(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["license_id"], ["licenses.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_services_host_id", "services", ["host_id"])
    op.create_index("ix_services_license_id", "services", ["license_id"])
    op.create_index("ix_services_status_owner_team", "services", ["status", "owner_team"])

    op.create_table(
        "vms",
        sa.Column("id", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("ip_address", sa.String(length=64), nullable=False),
        sa.Column("owner", sa.String(length=160), nullable=False),
        sa.Column("team", sa.String(length=120), nullable=False),
        sa.Column("purpose", sa.Text(), nullable=False),
        sa.Column("environment", sa.String(length=40), nullable=False),
        sa.Column("tags", sa.JSON(), nullable=False),
        sa.Column("cpu", sa.Integer(), nullable=False),
        sa.Column("ram_gb", sa.Integer(), nullable=False),
        sa.Column("disk_gb", sa.Integer(), nullable=False),
        sa.Column("os", sa.String(length=120), nullable=False),
        sa.Column("created_on", sa.Date(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("patch_status", sa.String(length=40), nullable=False),
        sa.Column("ownership_confidence", sa.String(length=40), nullable=False),
        sa.Column("review_status", sa.String(length=40), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_vms_environment", "vms", ["environment"])
    op.create_index("ix_vms_last_seen_at", "vms", ["last_seen_at"])
    op.create_index("ix_vms_team_review_status", "vms", ["team", "review_status"])

    op.create_table(
        "permissions",
        sa.Column("id", sa.String(length=80), nullable=False),
        sa.Column("principal", sa.String(length=240), nullable=False),
        sa.Column("system", sa.String(length=120), nullable=False),
        sa.Column("role", sa.String(length=120), nullable=False),
        sa.Column("risk_level", sa.String(length=40), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_permissions_principal", "permissions", ["principal"])
    op.create_index("ix_permissions_system_risk_level", "permissions", ["system", "risk_level"])

    op.create_table(
        "agent_sessions",
        sa.Column("id", sa.String(length=80), nullable=False),
        sa.Column("operator", sa.String(length=160), nullable=False),
        sa.Column("target", sa.String(length=200), nullable=False),
        sa.Column("task_summary", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("files_changed", sa.JSON(), nullable=False),
        sa.Column("commands_run", sa.JSON(), nullable=False),
        sa.Column("approval_required", sa.Boolean(), nullable=False),
        sa.Column("outcome", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agent_sessions_operator", "agent_sessions", ["operator"])
    op.create_index(
        "ix_agent_sessions_status_started_at",
        "agent_sessions",
        ["status", "started_at"],
    )
    op.create_index("ix_agent_sessions_target", "agent_sessions", ["target"])


def downgrade() -> None:
    op.drop_index("ix_agent_sessions_target", table_name="agent_sessions")
    op.drop_index("ix_agent_sessions_status_started_at", table_name="agent_sessions")
    op.drop_index("ix_agent_sessions_operator", table_name="agent_sessions")
    op.drop_table("agent_sessions")
    op.drop_index("ix_permissions_system_risk_level", table_name="permissions")
    op.drop_index("ix_permissions_principal", table_name="permissions")
    op.drop_table("permissions")
    op.drop_index("ix_vms_team_review_status", table_name="vms")
    op.drop_index("ix_vms_last_seen_at", table_name="vms")
    op.drop_index("ix_vms_environment", table_name="vms")
    op.drop_table("vms")
    op.drop_index("ix_services_status_owner_team", table_name="services")
    op.drop_index("ix_services_license_id", table_name="services")
    op.drop_index("ix_services_host_id", table_name="services")
    op.drop_table("services")
    op.drop_index("ix_licenses_owner_team_renewal_status", table_name="licenses")
    op.drop_index("ix_licenses_expires_on", table_name="licenses")
    op.drop_table("licenses")
