"""create action log table

Revision ID: 20260709_0003
Revises: 20260705_0002
Create Date: 2026-07-09 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260709_0003"
down_revision: str | None = "20260705_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "action_logs",
        sa.Column("id", sa.String(length=120), nullable=False),
        sa.Column("action_type", sa.String(length=120), nullable=False),
        sa.Column("target_system", sa.String(length=120), nullable=False),
        sa.Column("target_type", sa.String(length=80), nullable=False),
        sa.Column("target_id", sa.String(length=160), nullable=False),
        sa.Column("requested_by", sa.String(length=160), nullable=False),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("approval_status", sa.String(length=40), nullable=False),
        sa.Column("approved_by", sa.String(length=160), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("execution_status", sa.String(length=40), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("risk_level", sa.String(length=40), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("sanitized_parameters", sa.JSON(), nullable=False),
        sa.Column("before_state", sa.JSON(), nullable=False),
        sa.Column("after_state", sa.JSON(), nullable=False),
        sa.Column("result_summary", sa.Text(), nullable=False),
        sa.Column("evidence_links", sa.JSON(), nullable=False),
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
            onupdate=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_action_logs_approval_requested_at",
        "action_logs",
        ["approval_status", "requested_at"],
    )
    op.create_index(
        "ix_action_logs_execution_requested_at",
        "action_logs",
        ["execution_status", "requested_at"],
    )
    op.create_index(
        "ix_action_logs_target",
        "action_logs",
        ["target_system", "target_type", "target_id"],
    )
    op.create_index("ix_action_logs_requested_by", "action_logs", ["requested_by"])


def downgrade() -> None:
    op.drop_index("ix_action_logs_requested_by", table_name="action_logs")
    op.drop_index("ix_action_logs_target", table_name="action_logs")
    op.drop_index("ix_action_logs_execution_requested_at", table_name="action_logs")
    op.drop_index("ix_action_logs_approval_requested_at", table_name="action_logs")
    op.drop_table("action_logs")
