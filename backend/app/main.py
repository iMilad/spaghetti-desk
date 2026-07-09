from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.collectors.runtime import start_collector_runtime
from app.config import get_runtime_config


@asynccontextmanager
async def lifespan(app: FastAPI):
    collector_runtime = start_collector_runtime(get_runtime_config())
    app.state.collector_runtime = collector_runtime
    try:
        yield
    finally:
        collector_runtime.shutdown()


app = FastAPI(
    title="Spaghetti Desk API",
    description="Public-safe DevOps Control Center API.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api/v1")


@app.get("/healthz")
def healthz():
    return {"status": "ok"}
