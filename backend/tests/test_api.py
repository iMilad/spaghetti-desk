from datetime import UTC, datetime

from fastapi.testclient import TestClient
from pytest import MonkeyPatch
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.collectors import CollectorContext, CollectorResult
from app.config import clear_app_config_cache
from app.main import app
from app.persistence.base import Base
from app.persistence.database import get_session
from app.persistence.repositories import ActionLogRepository, CollectorRunRepository

client = TestClient(app)


def _clear_operator_env(monkeypatch: MonkeyPatch) -> None:
    for name in (
        "SPAGHETTI_OPERATOR_ID",
        "SPAGHETTI_OPERATOR_DISPLAY_NAME",
        "SPAGHETTI_OPERATOR_ROLE",
    ):
        monkeypatch.delenv(name, raising=False)


def test_healthz_returns_ok() -> None:
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_summary_uses_demo_inventory() -> None:
    response = client.get("/api/v1/summary")
    assert response.status_code == 200
    payload = response.json()
    assert payload["service_count"] == 4
    assert payload["vm_count"] == 6
    assert payload["unknown_owner_vm_count"] == 1
    assert payload["high_risk_permission_count"] == 1
    assert payload["action_log_count"] == 3
    assert payload["pending_approval_count"] == 1
    assert payload["failed_action_count"] == 1


def test_app_config_returns_public_module_config() -> None:
    response = client.get("/api/v1/app-config")
    assert response.status_code == 200
    payload = response.json()

    assert payload["modules"]["services"]["enabled"] is True
    assert payload["modules"]["permissions"]["showInOverview"] is False
    assert (
        payload["preferences"]["overviewWidgetStorageKey"]
        == "spaghetti-desk.overview-widgets.v1"
    )
    assert [item["id"] for item in payload["navigationItems"]] == [
        "overview",
        "services",
        "pipelines",
        "vms",
        "licenses",
        "permissions",
        "agents",
        "audit",
        "collectors",
    ]
    assert payload["overviewWidgets"][0]["id"] == "runtime-model"
    assert "database" not in payload
    assert "integrations" not in payload


def test_app_config_merges_local_overrides(tmp_path, monkeypatch) -> None:
    override = tmp_path / "config.yaml"
    override.write_text(
        """
ui:
  modules:
    vms:
      id: vms
      enabled: false
      show_in_overview: false
""",
        encoding="utf-8",
    )
    monkeypatch.setenv("SPAGHETTI_CONFIG_PATH", str(override))
    clear_app_config_cache()

    try:
        response = client.get("/api/v1/app-config")
    finally:
        clear_app_config_cache()

    assert response.status_code == 200
    payload = response.json()
    assert payload["modules"]["vms"]["enabled"] is False
    assert payload["modules"]["vms"]["label"] == "VMs"


def test_current_operator_returns_public_default(monkeypatch: MonkeyPatch) -> None:
    _clear_operator_env(monkeypatch)

    response = client.get("/api/v1/operator")
    assert response.status_code == 200
    assert response.json() == {
        "id": "local-operator",
        "displayName": "Local Operator",
        "role": "admin",
        "source": "config",
    }


def test_current_operator_reads_local_config_override(tmp_path, monkeypatch) -> None:
    _clear_operator_env(monkeypatch)

    override = tmp_path / "config.yaml"
    override.write_text(
        """
operator:
  id: local-reviewer
  display_name: Local Reviewer
  role: auditor
""",
        encoding="utf-8",
    )
    monkeypatch.setenv("SPAGHETTI_CONFIG_PATH", str(override))
    clear_app_config_cache()

    try:
        response = client.get("/api/v1/operator")
    finally:
        clear_app_config_cache()

    assert response.status_code == 200
    assert response.json() == {
        "id": "local-reviewer",
        "displayName": "Local Reviewer",
        "role": "auditor",
        "source": "config",
    }


def test_current_operator_prefers_environment_override(monkeypatch) -> None:
    monkeypatch.setenv("SPAGHETTI_OPERATOR_ID", "env-reviewer")
    monkeypatch.setenv("SPAGHETTI_OPERATOR_DISPLAY_NAME", "Environment Reviewer")
    monkeypatch.setenv("SPAGHETTI_OPERATOR_ROLE", "auditor")

    response = client.get("/api/v1/operator")

    assert response.status_code == 200
    assert response.json() == {
        "id": "env-reviewer",
        "displayName": "Environment Reviewer",
        "role": "auditor",
        "source": "environment",
    }


def test_collector_status_keeps_example_plugins_disabled() -> None:
    response = client.get("/api/v1/collectors")
    assert response.status_code == 200
    payload = response.json()

    jenkins = next(item for item in payload["collectors"] if item["name"] == "jenkins")
    assert jenkins["installed"] is False
    assert jenkins["enabled"] is False
    assert jenkins["configured"] is False
    assert jenkins["interval_seconds"] is None
    assert jenkins["last_run"] is None


def test_collector_status_includes_latest_local_run(tmp_path) -> None:
    engine = create_engine(f"sqlite+pysqlite:///{tmp_path / 'inventory.db'}")
    Base.metadata.create_all(engine)

    with Session(engine) as session:
        CollectorRunRepository(session).record_result(
            context=CollectorContext(
                run_id="api-run",
                started_at=datetime(2026, 7, 4, 8, 0, tzinfo=UTC),
                session=session,
            ),
            result=CollectorResult(
                collector_name="jenkins",
                status="skipped",
                message="Jenkins base_url is not configured.",
            ),
        )
        session.commit()

    def override_session():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    try:
        response = client.get("/api/v1/collectors")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    jenkins = next(item for item in payload["collectors"] if item["name"] == "jenkins")
    assert jenkins["last_run"]["run_id"] == "api-run"
    assert jenkins["last_run"]["status"] == "skipped"


def test_services_are_paginated_and_filterable() -> None:
    response = client.get("/api/v1/services", params={"limit": 2, "status": "healthy"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["meta"]["total"] == 3
    assert payload["meta"]["limit"] == 2
    assert len(payload["items"]) == 2
    assert all(item["status"] == "healthy" for item in payload["items"])


def test_vms_filter_by_review_status() -> None:
    response = client.get("/api/v1/vms", params={"review_status": "delete_candidate"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["meta"]["total"] == 1
    assert payload["items"][0]["id"] == "vm-demo-sandbox-01"


def test_action_logs_are_paginated_and_filterable(tmp_path) -> None:
    engine = create_engine(f"sqlite+pysqlite:///{tmp_path / 'inventory.db'}")
    Base.metadata.create_all(engine)

    def override_session():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    try:
        response = client.get(
            "/api/v1/action-logs",
            params={"approval_status": "pending", "limit": 10},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()

    assert payload["meta"]["total"] == 1
    assert payload["items"][0]["id"] == "action-demo-001"
    assert payload["items"][0]["sanitized_parameters"]["review_reason"] == "stale_owner"


def test_create_action_request_records_sanitized_pending_request(tmp_path) -> None:
    engine = create_engine(f"sqlite+pysqlite:///{tmp_path / 'inventory.db'}")
    Base.metadata.create_all(engine)

    def override_session():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    try:
        response = client.post(
            "/api/v1/action-requests",
            json={
                "action_type": "vm.review.request",
                "target_system": "spaghetti-desk",
                "target_type": "vm",
                "target_id": "vm-demo-build-01",
                "requested_by": "demo-operator",
                "summary": "Request owner review for stale demo build worker.",
                "risk_level": "medium",
                "parameters": {
                    "review_reason": "stale_owner",
                    "api_token": "should-not-be-stored",
                    "retry_count": 2,
                },
                "before_state": {"owner": "Unknown"},
            },
        )
        payload = response.json()

        with Session(engine) as session:
            page = ActionLogRepository(session).list_action_logs(limit=10, offset=0)
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 201
    assert payload["approval_status"] == "pending"
    assert payload["execution_status"] == "blocked"
    assert payload["started_at"] is None
    assert payload["finished_at"] is None
    assert payload["duration_ms"] is None
    assert payload["sanitized_parameters"]["api_token"] == "[redacted]"
    assert payload["sanitized_parameters"]["retry_count"] == "2"
    assert "no external operation was performed" in payload["result_summary"]
    assert page.total == 1
    assert page.items[0].id == payload["id"]


def test_create_low_risk_action_request_does_not_require_approval(tmp_path) -> None:
    engine = create_engine(f"sqlite+pysqlite:///{tmp_path / 'inventory.db'}")
    Base.metadata.create_all(engine)

    def override_session():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    try:
        response = client.post(
            "/api/v1/action-requests",
            json={
                "action_type": "service.maintenance.note",
                "target_system": "spaghetti-desk",
                "target_type": "service",
                "target_id": "service-demo-ci",
                "requested_by": "demo-operator",
                "summary": "Record a local demo maintenance note.",
                "risk_level": "low",
                "requires_approval": False,
                "parameters": {"note_type": "maintenance"},
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 201
    payload = response.json()
    assert payload["approval_status"] == "not_required"
    assert payload["execution_status"] == "not_started"
    assert payload["started_at"] is None


def test_create_high_risk_action_request_cannot_bypass_approval(tmp_path) -> None:
    engine = create_engine(f"sqlite+pysqlite:///{tmp_path / 'inventory.db'}")
    Base.metadata.create_all(engine)

    def override_session():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    try:
        response = client.post(
            "/api/v1/action-requests",
            json={
                "action_type": "permission.review.sync",
                "target_system": "demo-ci",
                "target_type": "permission",
                "target_id": "permission-demo-001",
                "requested_by": "demo-agent",
                "summary": "Refresh demo permission evidence.",
                "risk_level": "high",
                "requires_approval": False,
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 201
    payload = response.json()
    assert payload["approval_status"] == "pending"
    assert payload["execution_status"] == "blocked"


def test_approve_action_request_records_decision_without_execution(tmp_path) -> None:
    engine = create_engine(f"sqlite+pysqlite:///{tmp_path / 'inventory.db'}")
    Base.metadata.create_all(engine)

    def override_session():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    try:
        create_response = client.post(
            "/api/v1/action-requests",
            json={
                "action_type": "vm.review.request",
                "target_system": "spaghetti-desk",
                "target_type": "vm",
                "target_id": "vm-demo-build-01",
                "requested_by": "demo-operator",
                "summary": "Request owner review for stale demo build worker.",
            },
        )
        action_id = create_response.json()["id"]

        response = client.post(
            f"/api/v1/action-requests/{action_id}/approve",
            json={"reason": "Demo approval only."},
        )

        with Session(engine) as session:
            stored = ActionLogRepository(session).get_action_log(action_id)
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["approval_status"] == "approved"
    assert payload["approved_by"] == "local-operator"
    assert payload["approved_at"] is not None
    assert payload["execution_status"] == "not_started"
    assert payload["started_at"] is None
    assert payload["after_state"]["approval_status"] == "approved"
    assert payload["after_state"]["decision_reason"] == "Demo approval only."
    assert "no external operation was performed" in payload["result_summary"]
    assert stored is not None
    assert stored.approval_status == "approved"


def test_reject_action_request_skips_execution(tmp_path) -> None:
    engine = create_engine(f"sqlite+pysqlite:///{tmp_path / 'inventory.db'}")
    Base.metadata.create_all(engine)

    def override_session():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    try:
        create_response = client.post(
            "/api/v1/action-requests",
            json={
                "action_type": "vm.review.request",
                "target_system": "spaghetti-desk",
                "target_type": "vm",
                "target_id": "vm-demo-build-01",
                "requested_by": "demo-operator",
                "summary": "Request owner review for stale demo build worker.",
            },
        )
        action_id = create_response.json()["id"]

        response = client.post(
            f"/api/v1/action-requests/{action_id}/reject",
            json={"reason": "Owner evidence is incomplete."},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["approval_status"] == "rejected"
    assert payload["approved_by"] == "local-operator"
    assert payload["approved_at"] is not None
    assert payload["execution_status"] == "skipped"
    assert payload["started_at"] is None
    assert payload["finished_at"] is None
    assert payload["after_state"]["approval_status"] == "rejected"
    assert "No external operation was performed" in payload["result_summary"]


def test_action_request_decision_requires_pending_request(tmp_path) -> None:
    engine = create_engine(f"sqlite+pysqlite:///{tmp_path / 'inventory.db'}")
    Base.metadata.create_all(engine)

    def override_session():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    try:
        create_response = client.post(
            "/api/v1/action-requests",
            json={
                "action_type": "service.maintenance.note",
                "target_system": "spaghetti-desk",
                "target_type": "service",
                "target_id": "service-demo-ci",
                "requested_by": "demo-operator",
                "summary": "Record a local demo maintenance note.",
                "risk_level": "low",
                "requires_approval": False,
            },
        )
        action_id = create_response.json()["id"]

        response = client.post(
            f"/api/v1/action-requests/{action_id}/approve",
            json={},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 409
    assert "only pending requests can be decided" in response.json()["detail"]


def test_action_request_decision_reports_missing_request(tmp_path) -> None:
    engine = create_engine(f"sqlite+pysqlite:///{tmp_path / 'inventory.db'}")
    Base.metadata.create_all(engine)

    def override_session():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    try:
        response = client.post(
            "/api/v1/action-requests/action-missing/approve",
            json={},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 404
    assert "was not found" in response.json()["detail"]


def test_create_action_request_rejects_invalid_action_type(tmp_path) -> None:
    engine = create_engine(f"sqlite+pysqlite:///{tmp_path / 'inventory.db'}")
    Base.metadata.create_all(engine)

    def override_session():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    try:
        response = client.post(
            "/api/v1/action-requests",
            json={
                "action_type": "Run Shell",
                "target_system": "spaghetti-desk",
                "target_type": "vm",
                "target_id": "vm-demo-build-01",
                "requested_by": "demo-operator",
                "summary": "Invalid action type should be rejected.",
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422


def test_create_action_request_reports_missing_action_log_table(tmp_path) -> None:
    engine = create_engine(f"sqlite+pysqlite:///{tmp_path / 'inventory.db'}")

    def override_session():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    try:
        response = client.post(
            "/api/v1/action-requests",
            json={
                "action_type": "vm.review.request",
                "target_system": "spaghetti-desk",
                "target_type": "vm",
                "target_id": "vm-demo-build-01",
                "requested_by": "demo-operator",
                "summary": "Request owner review for stale demo build worker.",
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 503
    assert "alembic upgrade head" in response.json()["detail"]
