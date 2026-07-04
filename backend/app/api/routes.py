from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Query

from app.config import get_app_config
from app.demo_data import get_inventory, get_inventory_summary
from app.models import (
    VM,
    AgentSession,
    AgentSessionPage,
    AppConfig,
    License,
    LicensePage,
    PageMeta,
    Permission,
    PermissionPage,
    Service,
    ServicePage,
    VMPage,
)

router = APIRouter()


def _page_items[PageItem](
    items: Sequence[PageItem],
    limit: int,
    offset: int,
) -> tuple[list[PageItem], PageMeta]:
    total = len(items)
    return list(items[offset : offset + limit]), PageMeta(total=total, limit=limit, offset=offset)


def _filter_equal[PageItem](
    items: Sequence[PageItem],
    field_name: str,
    value: str | None,
) -> list[PageItem]:
    if value is None:
        return list(items)
    normalized = value.casefold()
    return [
        item
        for item in items
        if str(getattr(item, field_name, "")).casefold() == normalized
    ]


@router.get("/summary")
def read_summary():
    return get_inventory_summary()


@router.get("/app-config", response_model=AppConfig)
def read_app_config():
    return get_app_config()


@router.get("/services", response_model=ServicePage)
def list_services(
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    status: str | None = None,
    owner_team: str | None = None,
):
    inventory = get_inventory()
    items: list[Service] = _filter_equal(inventory.services, "status", status)
    items = _filter_equal(items, "owner_team", owner_team)
    page, meta = _page_items(items, limit, offset)
    return ServicePage(meta=meta, items=page)


@router.get("/vms", response_model=VMPage)
def list_vms(
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    team: str | None = None,
    review_status: str | None = None,
    ownership_confidence: str | None = None,
):
    inventory = get_inventory()
    items: list[VM] = _filter_equal(inventory.vms, "team", team)
    items = _filter_equal(items, "review_status", review_status)
    items = _filter_equal(items, "ownership_confidence", ownership_confidence)
    page, meta = _page_items(items, limit, offset)
    return VMPage(meta=meta, items=page)


@router.get("/licenses", response_model=LicensePage)
def list_licenses(
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    owner_team: str | None = None,
    renewal_status: str | None = None,
):
    inventory = get_inventory()
    items: list[License] = _filter_equal(inventory.licenses, "owner_team", owner_team)
    items = _filter_equal(items, "renewal_status", renewal_status)
    items = sorted(items, key=lambda item: item.expires_on)
    page, meta = _page_items(items, limit, offset)
    return LicensePage(meta=meta, items=page)


@router.get("/agent-sessions", response_model=AgentSessionPage)
def list_agent_sessions(
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    status: str | None = None,
):
    inventory = get_inventory()
    items: list[AgentSession] = _filter_equal(inventory.agent_sessions, "status", status)
    items = sorted(items, key=lambda item: item.started_at, reverse=True)
    page, meta = _page_items(items, limit, offset)
    return AgentSessionPage(meta=meta, items=page)


@router.get("/permissions", response_model=PermissionPage)
def list_permissions(
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    system: str | None = None,
    risk_level: str | None = None,
):
    inventory = get_inventory()
    items: list[Permission] = _filter_equal(inventory.permissions, "system", system)
    items = _filter_equal(items, "risk_level", risk_level)
    page, meta = _page_items(items, limit, offset)
    return PermissionPage(meta=meta, items=page)


@router.get("/freshness")
def read_inventory_freshness():
    inventory = get_inventory()
    return {
        "loaded_at": inventory.loaded_at,
        "source": "demo-data",
        "external_collectors_enabled": False,
        "read_model": "cached-json-demo",
        "server_time": datetime.now(UTC),
    }
