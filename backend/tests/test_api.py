from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


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

