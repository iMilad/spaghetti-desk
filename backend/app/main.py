from __future__ import annotations

import os
from contextlib import asynccontextmanager
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes import router
from app.collectors.runtime import start_collector_runtime
from app.config import get_runtime_config


@asynccontextmanager
async def lifespan(application: FastAPI):
    collector_runtime = start_collector_runtime(get_runtime_config())
    application.state.collector_runtime = collector_runtime
    try:
        yield
    finally:
        collector_runtime.shutdown()


def create_app(static_dir: str | Path | None = None) -> FastAPI:
    application = FastAPI(
        title="Spaghetti Desk API",
        description="Public-safe DevOps Control Center API.",
        version=_application_version(),
        lifespan=lifespan,
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ],
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    application.include_router(router, prefix="/api/v1")
    application.add_api_route("/healthz", healthz, methods=["GET"])

    frontend_dir = _resolve_frontend_dir(static_dir)
    if frontend_dir is not None:
        application.mount(
            "/",
            StaticFiles(directory=frontend_dir, html=True),
            name="frontend",
        )

    return application


def healthz():
    return {"status": "ok"}


def _application_version() -> str:
    configured_version = os.getenv("SPAGHETTI_VERSION", "").strip()
    if configured_version:
        return configured_version

    try:
        return version("spaghetti-desk-backend")
    except PackageNotFoundError:
        return "0.0.0"


def _resolve_frontend_dir(static_dir: str | Path | None) -> Path | None:
    configured_dir = static_dir
    if configured_dir is None:
        configured_dir = os.getenv("SPAGHETTI_STATIC_DIR")
    if configured_dir is None or not str(configured_dir).strip():
        return None

    frontend_dir = Path(configured_dir).resolve()
    if not (frontend_dir / "index.html").is_file():
        raise RuntimeError(
            f"frontend directory {frontend_dir} must contain index.html"
        )
    return frontend_dir


app = create_app()
