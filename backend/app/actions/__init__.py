from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from app.models import ActionLog, ActionRequestCreate, ActionRequestDecision

APPROVAL_REQUIRED_RISK_LEVELS = {"medium", "high"}
SENSITIVE_KEY_PARTS = (
    "api_key",
    "auth",
    "bearer",
    "cookie",
    "credential",
    "key",
    "password",
    "secret",
    "token",
)
MAX_SANITIZED_VALUE_LENGTH = 160


class ActionRequestStateError(ValueError):
    """Raised when a recorded action request cannot move to the requested state."""


def build_action_log(
    request: ActionRequestCreate,
    *,
    requested_at: datetime | None = None,
) -> ActionLog:
    timestamp = requested_at or datetime.now(UTC)
    approval_required = (
        request.requires_approval is True
        or request.risk_level in APPROVAL_REQUIRED_RISK_LEVELS
    )
    approval_status = "pending" if approval_required else "not_required"
    execution_status = "blocked" if approval_required else "not_started"

    return ActionLog(
        id=_action_id(timestamp),
        action_type=request.action_type,
        target_system=request.target_system,
        target_type=request.target_type,
        target_id=request.target_id,
        requested_by=request.requested_by,
        requested_at=timestamp,
        approval_status=approval_status,
        execution_status=execution_status,
        risk_level=request.risk_level,
        summary=request.summary,
        sanitized_parameters=sanitize_mapping(request.parameters),
        before_state=sanitize_mapping(request.before_state),
        after_state={},
        result_summary=(
            "Action request recorded only. The action runner is not enabled yet; "
            "no external operation was performed."
        ),
        evidence_links=[link.strip() for link in request.evidence_links if link.strip()],
    )


def approve_action_request(
    action_log: ActionLog,
    decision: ActionRequestDecision,
    *,
    reviewed_by: str,
    decided_at: datetime | None = None,
) -> ActionLog:
    timestamp = decided_at or datetime.now(UTC)
    _ensure_pending(action_log)
    after_state = _decision_state(
        action_log,
        approval_status="approved",
        reason=decision.reason,
    )
    return action_log.model_copy(
        update={
            "approval_status": "approved",
            "approved_by": reviewed_by,
            "approved_at": timestamp,
            "execution_status": "not_started",
            "after_state": after_state,
            "result_summary": (
                "Action request approved. The action runner is not enabled yet; "
                "no external operation was performed."
            ),
        }
    )


def reject_action_request(
    action_log: ActionLog,
    decision: ActionRequestDecision,
    *,
    reviewed_by: str,
    decided_at: datetime | None = None,
) -> ActionLog:
    timestamp = decided_at or datetime.now(UTC)
    _ensure_pending(action_log)
    after_state = _decision_state(
        action_log,
        approval_status="rejected",
        reason=decision.reason,
    )
    return action_log.model_copy(
        update={
            "approval_status": "rejected",
            "approved_by": reviewed_by,
            "approved_at": timestamp,
            "execution_status": "skipped",
            "after_state": after_state,
            "result_summary": "Action request rejected. No external operation was performed.",
        }
    )


def sanitize_mapping(values: dict[str, Any]) -> dict[str, str]:
    sanitized: dict[str, str] = {}
    for raw_key, raw_value in sorted(values.items()):
        key = _sanitize_key(raw_key)
        if not key:
            continue
        sanitized[key] = "[redacted]" if _is_sensitive_key(key) else _sanitize_value(raw_value)
    return sanitized


def _ensure_pending(action_log: ActionLog) -> None:
    if action_log.approval_status != "pending":
        raise ActionRequestStateError(
            f"Action request {action_log.id} is {action_log.approval_status}; "
            "only pending requests can be decided."
        )


def _decision_state(
    action_log: ActionLog,
    *,
    approval_status: str,
    reason: str | None,
) -> dict[str, str]:
    after_state = dict(action_log.after_state)
    after_state["approval_status"] = approval_status
    if reason:
        after_state["decision_reason"] = _sanitize_value(reason)
    return after_state


def _action_id(requested_at: datetime) -> str:
    timestamp = requested_at.astimezone(UTC).strftime("%Y%m%d%H%M%S")
    return f"action-{timestamp}-{uuid4().hex[:8]}"


def _sanitize_key(value: str) -> str:
    return value.strip().replace(" ", "_")[:80]


def _sanitize_value(value: Any) -> str:
    if isinstance(value, str):
        text = value.strip()
    elif value is None or isinstance(value, bool | int | float):
        text = str(value)
    else:
        text = json.dumps(value, sort_keys=True, separators=(",", ":"))
    return text[:MAX_SANITIZED_VALUE_LENGTH]


def _is_sensitive_key(key: str) -> bool:
    normalized = key.casefold()
    return any(part in normalized for part in SENSITIVE_KEY_PARTS)
