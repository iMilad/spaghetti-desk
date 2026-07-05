"""create collector plugin tables

Revision ID: 20260705_0002
Revises: 20260704_0001
Create Date: 2026-07-05 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260705_0002"
down_revision: str | None = "20260704_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "pipelines",
        sa.Column("id", sa.String(length=120), nullable=False),
        sa.Column("provider", sa.String(length=80), nullable=False),
        sa.Column("source_id", sa.String(length=240), nullable=False),
        sa.Column("name", sa.String(length=240), nullable=False),
        sa.Column("source_url", sa.String(length=500), nullable=False),
        sa.Column("owner_team", sa.String(length=120), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("last_run_status", sa.String(length=40), nullable=True),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_duration_ms", sa.Integer(), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=False),
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
    op.create_index("ix_pipelines_last_run_at", "pipelines", ["last_run_at"])
    op.create_index("ix_pipelines_owner_team", "pipelines", ["owner_team"])
    op.create_index("ix_pipelines_provider_status", "pipelines", ["provider", "status"])

    op.create_table(
        "collector_runs",
        sa.Column("id", sa.String(length=120), nullable=False),
        sa.Column("run_id", sa.String(length=80), nullable=False),
        sa.Column("collector_name", sa.String(length=120), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("dry_run", sa.Boolean(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=False),
        sa.Column("records_seen", sa.Integer(), nullable=False),
        sa.Column("records_changed", sa.Integer(), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("metadata", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_collector_runs_collector_started_at",
        "collector_runs",
        ["collector_name", "started_at"],
    )
    op.create_index(
        "ix_collector_runs_status_started_at",
        "collector_runs",
        ["status", "started_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_collector_runs_status_started_at", table_name="collector_runs")
    op.drop_index("ix_collector_runs_collector_started_at", table_name="collector_runs")
    op.drop_table("collector_runs")
    op.drop_index("ix_pipelines_provider_status", table_name="pipelines")
    op.drop_index("ix_pipelines_owner_team", table_name="pipelines")
    op.drop_index("ix_pipelines_last_run_at", table_name="pipelines")
    op.drop_table("pipelines")
