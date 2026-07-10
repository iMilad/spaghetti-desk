from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


def test_create_app_serves_compiled_frontend_and_api(tmp_path: Path) -> None:
    assets_dir = tmp_path / "assets"
    assets_dir.mkdir()
    (tmp_path / "index.html").write_text(
        '<!doctype html><html><body><div id="root"></div></body></html>',
        encoding="utf-8",
    )
    (assets_dir / "app.js").write_text("console.log('demo');", encoding="utf-8")

    with TestClient(create_app(static_dir=tmp_path)) as client:
        index_response = client.get("/")
        asset_response = client.get("/assets/app.js")
        health_response = client.get("/healthz")
        api_response = client.get("/api/v1/app-config")

    assert index_response.status_code == 200
    assert '<div id="root"></div>' in index_response.text
    assert asset_response.status_code == 200
    assert asset_response.text == "console.log('demo');"
    assert health_response.json() == {"status": "ok"}
    assert api_response.status_code == 200


def test_create_app_rejects_incomplete_frontend_bundle(tmp_path: Path) -> None:
    with pytest.raises(RuntimeError, match="must contain index.html"):
        create_app(static_dir=tmp_path)
