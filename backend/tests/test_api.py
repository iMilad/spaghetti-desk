from fastapi.testclient import TestClient

from app.config import clear_app_config_cache
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
        "vms",
        "licenses",
        "permissions",
        "agents",
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


def test_collector_status_keeps_example_plugins_disabled() -> None:
    response = client.get("/api/v1/collectors")
    assert response.status_code == 200
    payload = response.json()

    jenkins = next(item for item in payload["collectors"] if item["name"] == "jenkins")
    assert jenkins["installed"] is False
    assert jenkins["enabled"] is False
    assert jenkins["interval_seconds"] is None


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
