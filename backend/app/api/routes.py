from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.actions import (
    ActionRequestStateError,
    approve_action_request,
    build_action_log,
    reject_action_request,
)
from app.collectors.plugins import list_collector_plugin_status
from app.collectors.runtime import start_collector_runtime
from app.config import get_app_config, get_current_operator, get_runtime_config
from app.demo_data import get_inventory, get_inventory_summary
from app.models import (
    VM,
    ActionLog,
    ActionLogPage,
    ActionRequestCreate,
    ActionRequestDecision,
    AgentSession,
    AgentSessionPage,
    AppBootstrap,
    AppConfig,
    CollectorRunPage,
    CollectorStatusResponse,
    ConnectionTestResponse,
    CurrentOperator,
    DashboardData,
    JenkinsConnectionTest,
    License,
    LicensePage,
    PageMeta,
    Permission,
    PermissionPage,
    PipelinePage,
    Service,
    ServicePage,
    SettingsResponse,
    SettingsSaveResponse,
    SettingsUpdate,
    VMPage,
)
from app.persistence.database import get_session
from app.persistence.repositories import (
    ActionLogRepository,
    CollectorRunRepository,
    PageResult,
    PipelineRepository,
)
from app.settings import (
    SettingsWriteError,
    check_jenkins_connection,
    read_settings,
    save_settings,
)

router = APIRouter()

ACTION_REQUEST_DB_UNAVAILABLE_DETAIL = (
    "Inventory database is not initialized for action requests. "
    "Run `cd backend && uv run alembic upgrade head`."
)


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


def _page_response[PageItem, PageModel](
    result: PageResult[PageItem],
    limit: int,
    offset: int,
    page_model: type[PageModel],
) -> PageModel:
    return page_model(
        meta=PageMeta(total=result.total, limit=limit, offset=offset),
        items=result.items,
    )


def _list_local_action_logs(
    *,
    session: Session,
    limit: int,
    approval_status: str | None,
    execution_status: str | None,
    target_system: str | None,
) -> list[ActionLog]:
    demo_items = _filter_action_logs(
        get_inventory().action_logs,
        approval_status=approval_status,
        execution_status=execution_status,
        target_system=target_system,
    )
    try:
        persisted = ActionLogRepository(session).list_action_logs(
            limit=limit,
            offset=0,
            approval_status=approval_status,
            execution_status=execution_status,
            target_system=target_system,
        )
    except SQLAlchemyError:
        return demo_items

    by_id = {item.id: item for item in demo_items}
    for item in persisted.items:
        by_id[item.id] = item
    return list(by_id.values())


def _filter_action_logs(
    action_logs: Sequence[ActionLog],
    *,
    approval_status: str | None,
    execution_status: str | None,
    target_system: str | None,
) -> list[ActionLog]:
    items: list[ActionLog] = _filter_equal(action_logs, "approval_status", approval_status)
    items = _filter_equal(items, "execution_status", execution_status)
    items = _filter_equal(items, "target_system", target_system)
    return items


def _requested_at_sort_value(action_log: ActionLog) -> float:
    requested_at = action_log.requested_at
    if requested_at.tzinfo is None:
        requested_at = requested_at.replace(tzinfo=UTC)
    return requested_at.timestamp()


def _summary_with_action_counts(action_logs: Sequence[ActionLog]):
    summary = get_inventory_summary()
    return summary.model_copy(
        update={
            "action_log_count": len(action_logs),
            "pending_approval_count": len(
                [
                    action_log
                    for action_log in action_logs
                    if action_log.approval_status == "pending"
                ]
            ),
            "failed_action_count": len(
                [
                    action_log
                    for action_log in action_logs
                    if action_log.execution_status == "failed"
                ]
            ),
        }
    )


def _collector_statuses(session: Session) -> CollectorStatusResponse:
    statuses = list_collector_plugin_status(get_runtime_config())
    try:
        latest_runs = CollectorRunRepository(session).latest_runs_by_collector(
            status.name for status in statuses
        )
    except SQLAlchemyError:
        latest_runs = {}

    return CollectorStatusResponse(
        collectors=[
            {
                "name": status.name,
                "installed": status.installed,
                "enabled": status.enabled,
                "configured": status.configured,
                "interval_seconds": status.interval_seconds,
                "last_run": latest_runs.get(status.name),
            }
            for status in statuses
        ]
    )


def _dashboard_data(session: Session) -> DashboardData:
    inventory = get_inventory()
    action_logs = _list_local_action_logs(
        session=session,
        limit=100,
        approval_status=None,
        execution_status=None,
        target_system=None,
    )
    action_logs = sorted(action_logs, key=_requested_at_sort_value, reverse=True)[:20]

    try:
        pipeline_result = PipelineRepository(session).list_pipelines(limit=20, offset=0)
        pipelines = pipeline_result.items
    except SQLAlchemyError:
        pipelines = []

    try:
        collector_runs = CollectorRunRepository(session).list_runs(limit=20, offset=0).items
    except SQLAlchemyError:
        collector_runs = []

    return DashboardData(
        summary=_summary_with_action_counts(action_logs),
        services=inventory.services[:10],
        pipelines=pipelines,
        vms=inventory.vms[:10],
        licenses=sorted(inventory.licenses, key=lambda item: item.expires_on)[:10],
        agent_sessions=sorted(
            inventory.agent_sessions,
            key=lambda item: item.started_at,
            reverse=True,
        )[:10],
        action_logs=action_logs,
        permissions=inventory.permissions[:10],
        collectors=_collector_statuses(session).collectors,
        collector_runs=collector_runs,
    )


def _app_bootstrap(session: Session) -> AppBootstrap:
    return AppBootstrap(
        app_config=get_app_config(),
        dashboard=_dashboard_data(session),
        operator=get_current_operator(),
    )


def _require_admin(operator: CurrentOperator) -> None:
    if operator.role.casefold() != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only an administrator can change integration settings.",
        )


def _start_settings_audit(
    session: Session,
    operator: CurrentOperator,
    payload: SettingsUpdate,
) -> ActionLog:
    started_at = datetime.now(UTC)
    action_log = build_action_log(
        ActionRequestCreate(
            action_type="settings.update",
            target_system="spaghetti-desk",
            target_type="configuration",
            target_id="local-settings",
            requested_by=operator.id,
            summary="Update local operator, collector, integration, and action settings.",
            risk_level="low",
            requires_approval=False,
            parameters={
                "operator_id": payload.operator.id,
                "collectors_enabled": payload.collectors_enabled,
                "jenkins_enabled": payload.jenkins.enabled,
                "inventory_writes": payload.write_to_local_inventory,
                "credentials_supplied": bool(
                    payload.jenkins.username is not None
                    or payload.jenkins.token is not None
                    or payload.jenkins.clear_credentials
                ),
            },
        ),
        requested_at=started_at,
    ).model_copy(
        update={
            "execution_status": "running",
            "started_at": started_at,
            "result_summary": "Settings update validation passed; persistence started.",
        }
    )
    try:
        stored = ActionLogRepository(session).record_action_log(action_log)
        session.commit()
    except SQLAlchemyError as error:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Settings cannot be changed until the audit database is available.",
        ) from error
    return stored


def _finish_settings_audit(
    session: Session,
    action_log: ActionLog,
    *,
    succeeded: bool,
    result_summary: str,
    after_state: dict[str, str],
) -> None:
    finished_at = datetime.now(UTC)
    started_at = action_log.started_at or action_log.requested_at
    duration_ms = max(0, int((finished_at - started_at).total_seconds() * 1000))
    updated = action_log.model_copy(
        update={
            "execution_status": "succeeded" if succeeded else "failed",
            "finished_at": finished_at,
            "duration_ms": duration_ms,
            "after_state": after_state,
            "result_summary": result_summary,
        }
    )
    try:
        ActionLogRepository(session).record_action_log(updated)
        session.commit()
    except SQLAlchemyError as error:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Settings were processed, but their audit result could not be stored.",
        ) from error


def _reload_collector_runtime(request: Request) -> bool:
    try:
        replacement = start_collector_runtime(get_runtime_config())
    except Exception:
        return False

    current = getattr(request.app.state, "collector_runtime", None)
    if current is not None:
        current.shutdown()
    request.app.state.collector_runtime = replacement
    return True


@router.get("/summary")
def read_summary():
    return get_inventory_summary()


@router.get("/app-config", response_model=AppConfig)
def read_app_config():
    return get_app_config()


@router.get("/operator", response_model=CurrentOperator)
def read_current_operator():
    return get_current_operator()


@router.get("/settings", response_model=SettingsResponse)
def read_managed_settings():
    return read_settings()


@router.post("/settings/test-jenkins", response_model=ConnectionTestResponse)
def test_managed_jenkins_connection(
    payload: JenkinsConnectionTest,
    operator: Annotated[CurrentOperator, Depends(get_current_operator)],
):
    _require_admin(operator)
    return check_jenkins_connection(payload)


@router.post("/settings", response_model=SettingsSaveResponse)
def update_managed_settings(
    payload: SettingsUpdate,
    request: Request,
    session: Annotated[Session, Depends(get_session)],
    operator: Annotated[CurrentOperator, Depends(get_current_operator)],
):
    _require_admin(operator)
    before = read_settings()
    audit_log = _start_settings_audit(session, operator, payload)

    try:
        result = save_settings(payload)
    except SettingsWriteError as error:
        _finish_settings_audit(
            session,
            audit_log,
            succeeded=False,
            result_summary=str(error),
            after_state={},
        )
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error

    runtime_reloaded = _reload_collector_runtime(request)
    _finish_settings_audit(
        session,
        audit_log,
        succeeded=True,
        result_summary=(
            "Settings saved and collector runtime reloaded."
            if runtime_reloaded
            else "Settings saved. Restart the backend to reload collectors."
        ),
        after_state={
            "operator_id": result.settings.operator.id,
            "collectors_enabled": str(result.settings.collectors_enabled),
            "jenkins_enabled": str(result.settings.jenkins.enabled),
            "inventory_writes": str(result.settings.write_to_local_inventory),
            "credentials_changed": str(result.credentials_changed),
            "previous_operator_id": before.operator.id,
        },
    )
    return SettingsSaveResponse(
        settings=result.settings,
        message=(
            "Settings saved and collectors reloaded."
            if runtime_reloaded
            else "Settings saved. Restart the backend to reload collectors."
        ),
        collector_runtime_reloaded=runtime_reloaded,
    )


@router.get("/bootstrap", response_model=AppBootstrap)
def read_app_bootstrap(session: Annotated[Session, Depends(get_session)]):
    return _app_bootstrap(session)


@router.get("/bootstrap.js")
def read_app_bootstrap_script(
    session: Annotated[Session, Depends(get_session)],
    callback: Annotated[
        str,
        Query(min_length=1, max_length=80, pattern=r"^[A-Za-z_$][A-Za-z0-9_$]*$"),
    ],
):
    payload = _app_bootstrap(session).model_dump_json(by_alias=True)
    return Response(
        content=f'globalThis["{callback}"]({payload});',
        media_type="application/javascript; charset=utf-8",
        headers={"Cache-Control": "no-store"},
    )


@router.get("/collectors", response_model=CollectorStatusResponse)
def list_collectors(session: Annotated[Session, Depends(get_session)]):
    return _collector_statuses(session)


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


@router.get("/action-logs", response_model=ActionLogPage)
def list_action_logs(
    session: Annotated[Session, Depends(get_session)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    approval_status: str | None = None,
    execution_status: str | None = None,
    target_system: str | None = None,
):
    items = _list_local_action_logs(
        session=session,
        limit=100,
        approval_status=approval_status,
        execution_status=execution_status,
        target_system=target_system,
    )
    items = sorted(items, key=_requested_at_sort_value, reverse=True)
    page, meta = _page_items(items, limit, offset)
    return ActionLogPage(meta=meta, items=page)


@router.post(
    "/action-requests",
    response_model=ActionLog,
    status_code=status.HTTP_201_CREATED,
)
def create_action_request(
    payload: ActionRequestCreate,
    session: Annotated[Session, Depends(get_session)],
):
    action_log = build_action_log(payload)
    try:
        created = ActionLogRepository(session).record_action_log(action_log)
        session.commit()
    except SQLAlchemyError as exc:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=ACTION_REQUEST_DB_UNAVAILABLE_DETAIL,
        ) from exc
    return created


@router.post(
    "/action-requests/{action_id}/approve",
    response_model=ActionLog,
)
def approve_recorded_action_request(
    action_id: str,
    payload: ActionRequestDecision,
    session: Annotated[Session, Depends(get_session)],
    operator: Annotated[CurrentOperator, Depends(get_current_operator)],
):
    return _decide_recorded_action_request(
        action_id=action_id,
        payload=payload,
        session=session,
        operator=operator,
        decision="approve",
    )


@router.post(
    "/action-requests/{action_id}/reject",
    response_model=ActionLog,
)
def reject_recorded_action_request(
    action_id: str,
    payload: ActionRequestDecision,
    session: Annotated[Session, Depends(get_session)],
    operator: Annotated[CurrentOperator, Depends(get_current_operator)],
):
    return _decide_recorded_action_request(
        action_id=action_id,
        payload=payload,
        session=session,
        operator=operator,
        decision="reject",
    )


def _decide_recorded_action_request(
    *,
    action_id: str,
    payload: ActionRequestDecision,
    session: Session,
    operator: CurrentOperator,
    decision: str,
) -> ActionLog:
    repository = ActionLogRepository(session)
    try:
        action_log = repository.get_action_log(action_id)
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=ACTION_REQUEST_DB_UNAVAILABLE_DETAIL,
        ) from exc

    if action_log is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Action request {action_id} was not found.",
        )

    try:
        updated = (
            approve_action_request(action_log, payload, reviewed_by=operator.id)
            if decision == "approve"
            else reject_action_request(action_log, payload, reviewed_by=operator.id)
        )
        stored = repository.record_action_log(updated)
        session.commit()
    except ActionRequestStateError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    except SQLAlchemyError as exc:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=ACTION_REQUEST_DB_UNAVAILABLE_DETAIL,
        ) from exc
    return stored


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


@router.get("/pipelines", response_model=PipelinePage)
def list_pipelines(
    session: Annotated[Session, Depends(get_session)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    provider: str | None = None,
    status: str | None = None,
    owner_team: str | None = None,
):
    result = PipelineRepository(session).list_pipelines(
        limit=limit,
        offset=offset,
        provider=provider,
        status=status,
        owner_team=owner_team,
    )
    return _page_response(result, limit, offset, PipelinePage)


@router.get("/collector-runs", response_model=CollectorRunPage)
def list_collector_runs(
    session: Annotated[Session, Depends(get_session)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    collector_name: str | None = None,
    status: str | None = None,
):
    result = CollectorRunRepository(session).list_runs(
        limit=limit,
        offset=offset,
        collector_name=collector_name,
        status=status,
    )
    return _page_response(result, limit, offset, CollectorRunPage)


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
