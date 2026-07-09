from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.models import (
    VM,
    ActionLog,
    AgentSession,
    InventoryData,
    InventorySummary,
    License,
    Permission,
    Service,
)


def _default_data_dir() -> Path:
    return Path(__file__).resolve().parents[2] / "examples" / "demo-data"


def _configured_data_dir() -> Path:
    return Path(os.getenv("SPAGHETTI_DEMO_DATA_DIR", _default_data_dir()))


def _read_json(path: Path) -> list[dict[str, Any]]:
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _load_inventory(data_dir: str) -> InventoryData:
    base_path = Path(data_dir)
    return InventoryData(
        services=[Service.model_validate(item) for item in _read_json(base_path / "services.json")],
        vms=[VM.model_validate(item) for item in _read_json(base_path / "vms.json")],
        licenses=[License.model_validate(item) for item in _read_json(base_path / "licenses.json")],
        permissions=[
            Permission.model_validate(item) for item in _read_json(base_path / "permissions.json")
        ],
        agent_sessions=[
            AgentSession.model_validate(item)
            for item in _read_json(base_path / "agent_sessions.json")
        ],
        action_logs=[
            ActionLog.model_validate(item) for item in _read_json(base_path / "action_logs.json")
        ],
    )


def get_inventory() -> InventoryData:
    return _load_inventory(str(_configured_data_dir()))


def get_inventory_summary() -> InventorySummary:
    inventory = get_inventory()
    return InventorySummary(
        service_count=len(inventory.services),
        degraded_service_count=sum(service.status != "healthy" for service in inventory.services),
        vm_count=len(inventory.vms),
        unknown_owner_vm_count=sum(
            vm.ownership_confidence == "unknown" for vm in inventory.vms
        ),
        review_needed_vm_count=sum(
            vm.review_status in {"stale", "delete_candidate"} for vm in inventory.vms
        ),
        license_count=len(inventory.licenses),
        renewal_review_count=sum(
            license_item.renewal_status == "review_needed"
            for license_item in inventory.licenses
        ),
        permission_count=len(inventory.permissions),
        high_risk_permission_count=sum(
            permission.risk_level == "high" for permission in inventory.permissions
        ),
        agent_session_count=len(inventory.agent_sessions),
        agent_sessions_needing_review=sum(
            session.status == "needs_review" for session in inventory.agent_sessions
        ),
        action_log_count=len(inventory.action_logs),
        pending_approval_count=sum(
            action.approval_status == "pending" for action in inventory.action_logs
        ),
        failed_action_count=sum(
            action.execution_status == "failed" for action in inventory.action_logs
        ),
        loaded_at=inventory.loaded_at,
    )


def clear_inventory_cache() -> None:
    _load_inventory.cache_clear()
