from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any, Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator, model_validator

FeatureModuleId = Literal[
    "services",
    "vms",
    "licenses",
    "permissions",
    "agents",
    "pipelines",
    "audit",
]
ViewId = Literal[
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
OverviewWidgetId = Literal[
    "runtime-model",
    "service-health",
    "vm-ownership",
    "license-renewals",
    "permission-risk",
    "agent-activity",
    "action-audit",
]
ActionRiskLevel = Literal["low", "medium", "high"]
ActionApprovalStatus = Literal["pending", "approved", "rejected", "not_required"]
ActionExecutionStatus = Literal[
    "not_started",
    "queued",
    "blocked",
    "running",
    "succeeded",
    "failed",
    "skipped",
]
OperatorIdentitySource = Literal["config", "environment"]


class PageMeta(BaseModel):
    total: int = Field(ge=0)
    limit: int = Field(ge=1)
    offset: int = Field(ge=0)


class Service(BaseModel):
    id: str
    name: str
    service_type: str
    status: str
    owner_team: str
    lifecycle: str
    version: str
    example_url: str
    host_id: str
    license_id: str | None = None
    backup_status: str
    monitoring_status: str
    last_maintenance: date
    documentation_url: str
    known_risks: list[str] = Field(default_factory=list)


class VM(BaseModel):
    id: str
    name: str
    ip_address: str
    owner: str
    team: str
    purpose: str
    environment: str
    tags: list[str] = Field(default_factory=list)
    cpu: int = Field(ge=1)
    ram_gb: int = Field(ge=1)
    disk_gb: int = Field(ge=1)
    os: str
    created_on: date
    last_seen_at: datetime
    patch_status: str
    ownership_confidence: str
    review_status: str


class License(BaseModel):
    id: str
    name: str
    vendor: str
    category: str
    owner_team: str
    expires_on: date
    renewal_status: str
    risk: str


class Permission(BaseModel):
    id: str
    principal: str
    system: str
    role: str
    risk_level: str
    last_seen_at: datetime


class AgentSession(BaseModel):
    id: str
    operator: str
    target: str
    task_summary: str
    status: str
    started_at: datetime
    ended_at: datetime | None = None
    files_changed: list[str] = Field(default_factory=list)
    commands_run: list[str] = Field(default_factory=list)
    approval_required: bool
    outcome: str


class ActionLog(BaseModel):
    id: str
    action_type: str
    target_system: str
    target_type: str
    target_id: str
    requested_by: str
    requested_at: datetime
    approval_status: ActionApprovalStatus
    approved_by: str | None = None
    approved_at: datetime | None = None
    execution_status: ActionExecutionStatus
    started_at: datetime | None = None
    finished_at: datetime | None = None
    duration_ms: int | None = Field(default=None, ge=0)
    risk_level: ActionRiskLevel
    summary: str
    sanitized_parameters: dict[str, str] = Field(default_factory=dict)
    before_state: dict[str, str] = Field(default_factory=dict)
    after_state: dict[str, str] = Field(default_factory=dict)
    result_summary: str
    evidence_links: list[str] = Field(default_factory=list)


class ActionRequestCreate(BaseModel):
    action_type: str = Field(
        min_length=3,
        max_length=120,
        pattern=r"^[a-z][a-z0-9_.:-]*$",
    )
    target_system: str = Field(
        min_length=2,
        max_length=120,
        pattern=r"^[a-z][a-z0-9_.:-]*$",
    )
    target_type: str = Field(
        min_length=2,
        max_length=80,
        pattern=r"^[a-z][a-z0-9_-]*$",
    )
    target_id: str = Field(min_length=1, max_length=160)
    requested_by: str = Field(min_length=1, max_length=160)
    summary: str = Field(min_length=5, max_length=500)
    risk_level: ActionRiskLevel = "medium"
    requires_approval: bool | None = None
    parameters: dict[str, Any] = Field(default_factory=dict)
    before_state: dict[str, Any] = Field(default_factory=dict)
    evidence_links: list[str] = Field(default_factory=list, max_length=10)


class ActionRequestDecision(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class CurrentOperator(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(
        min_length=1,
        max_length=160,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9_.:@-]*$",
    )
    display_name: str = Field(
        min_length=1,
        max_length=160,
        validation_alias=AliasChoices("display_name", "displayName"),
        serialization_alias="displayName",
    )
    role: str = Field(min_length=1, max_length=80)
    source: OperatorIdentitySource


class Pipeline(BaseModel):
    id: str
    provider: str
    source_id: str
    name: str
    source_url: str
    owner_team: str
    status: str
    last_run_status: str | None = None
    last_run_at: datetime | None = None
    last_duration_ms: int | None = Field(default=None, ge=0)
    metadata: dict[str, str] = Field(default_factory=dict)


class CollectorRun(BaseModel):
    id: str
    run_id: str
    collector_name: str
    status: str
    dry_run: bool
    started_at: datetime
    finished_at: datetime | None = None
    duration_ms: int
    records_seen: int
    records_changed: int
    message: str
    metadata: dict[str, str] = Field(default_factory=dict)


class CollectorPluginState(BaseModel):
    name: str
    installed: bool
    enabled: bool
    configured: bool
    interval_seconds: int | None = None
    last_run: CollectorRun | None = None


class CollectorStatusResponse(BaseModel):
    collectors: list[CollectorPluginState]


class OperatorSettings(BaseModel):
    id: str = Field(
        min_length=1,
        max_length=160,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9_.:@-]*$",
    )
    display_name: str = Field(min_length=1, max_length=160)
    role: str = Field(min_length=1, max_length=80)


class JenkinsSettings(BaseModel):
    enabled: bool
    interval_seconds: int = Field(ge=10, le=86_400)
    base_url: str = Field(max_length=500)
    job_include_patterns: list[str] = Field(default_factory=list, max_length=100)
    default_owner_team: str = Field(min_length=1, max_length=160)
    timeout_seconds: float = Field(ge=1, le=120)
    verify_tls: bool
    username_configured: bool = False
    token_configured: bool = False

    @field_validator("base_url")
    @classmethod
    def validate_base_url(cls, value: str) -> str:
        normalized = value.strip().rstrip("/")
        if normalized and not normalized.startswith(("http://", "https://")):
            raise ValueError("Jenkins URL must start with http:// or https://")
        return normalized

    @field_validator("job_include_patterns")
    @classmethod
    def normalize_patterns(cls, values: list[str]) -> list[str]:
        return [value.strip() for value in values if value.strip()]


class ActionsSettings(BaseModel):
    enabled: bool
    require_approval_by_default: bool
    audit_all_attempts: bool


class SettingsStorage(BaseModel):
    writable: bool
    source: str
    message: str


class SettingsResponse(BaseModel):
    operator: OperatorSettings
    collectors_enabled: bool
    write_to_local_inventory: bool
    jenkins: JenkinsSettings
    actions: ActionsSettings
    storage: SettingsStorage


class JenkinsSettingsUpdate(BaseModel):
    enabled: bool
    interval_seconds: int = Field(ge=10, le=86_400)
    base_url: str = Field(max_length=500)
    job_include_patterns: list[str] = Field(default_factory=list, max_length=100)
    default_owner_team: str = Field(min_length=1, max_length=160)
    timeout_seconds: float = Field(ge=1, le=120)
    verify_tls: bool
    username: str | None = Field(default=None, max_length=320)
    token: str | None = Field(default=None, max_length=4096)
    clear_credentials: bool = False

    @field_validator("base_url")
    @classmethod
    def validate_base_url(cls, value: str) -> str:
        return JenkinsSettings.validate_base_url(value)

    @field_validator("job_include_patterns")
    @classmethod
    def normalize_patterns(cls, values: list[str]) -> list[str]:
        return JenkinsSettings.normalize_patterns(values)

    @field_validator("username", "token")
    @classmethod
    def reject_multiline_secrets(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if "\n" in value or "\r" in value:
            raise ValueError("Credentials cannot contain line breaks")
        return value


class SettingsUpdate(BaseModel):
    operator: OperatorSettings
    collectors_enabled: bool
    write_to_local_inventory: bool
    jenkins: JenkinsSettingsUpdate
    actions: ActionsSettings


class SettingsSaveResponse(BaseModel):
    settings: SettingsResponse
    message: str
    collector_runtime_reloaded: bool


class JenkinsConnectionTest(BaseModel):
    base_url: str = Field(max_length=500)
    timeout_seconds: float = Field(ge=1, le=120)
    verify_tls: bool
    username: str | None = Field(default=None, max_length=320)
    token: str | None = Field(default=None, max_length=4096)

    @field_validator("base_url")
    @classmethod
    def validate_base_url(cls, value: str) -> str:
        normalized = JenkinsSettings.validate_base_url(value)
        if not normalized or normalized.endswith(".example.invalid"):
            raise ValueError("Enter your Jenkins URL before testing the connection")
        return normalized

    @field_validator("username", "token")
    @classmethod
    def reject_multiline_secrets(cls, value: str | None) -> str | None:
        return JenkinsSettingsUpdate.reject_multiline_secrets(value)


class ConnectionTestResponse(BaseModel):
    success: bool
    message: str
    records_seen: int = 0


class ServicePage(BaseModel):
    meta: PageMeta
    items: list[Service]


class VMPage(BaseModel):
    meta: PageMeta
    items: list[VM]


class LicensePage(BaseModel):
    meta: PageMeta
    items: list[License]


class PermissionPage(BaseModel):
    meta: PageMeta
    items: list[Permission]


class AgentSessionPage(BaseModel):
    meta: PageMeta
    items: list[AgentSession]


class ActionLogPage(BaseModel):
    meta: PageMeta
    items: list[ActionLog]


class PipelinePage(BaseModel):
    meta: PageMeta
    items: list[Pipeline]


class CollectorRunPage(BaseModel):
    meta: PageMeta
    items: list[CollectorRun]


class DashboardData(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    summary: InventorySummary
    services: list[Service]
    vms: list[VM]
    licenses: list[License]
    permissions: list[Permission]
    agent_sessions: list[AgentSession] = Field(
        validation_alias=AliasChoices("agent_sessions", "agentSessions"),
        serialization_alias="agentSessions",
    )
    action_logs: list[ActionLog] = Field(
        validation_alias=AliasChoices("action_logs", "actionLogs"),
        serialization_alias="actionLogs",
    )
    pipelines: list[Pipeline]
    collectors: list[CollectorPluginState]
    collector_runs: list[CollectorRun] = Field(
        validation_alias=AliasChoices("collector_runs", "collectorRuns"),
        serialization_alias="collectorRuns",
    )


class AppBootstrap(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    app_config: AppConfig = Field(
        validation_alias=AliasChoices("app_config", "appConfig"),
        serialization_alias="appConfig",
    )
    dashboard: DashboardData
    operator: CurrentOperator


class InventoryData(BaseModel):
    services: list[Service]
    vms: list[VM]
    licenses: list[License]
    permissions: list[Permission]
    agent_sessions: list[AgentSession]
    action_logs: list[ActionLog]
    loaded_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class InventorySummary(BaseModel):
    service_count: int
    degraded_service_count: int
    vm_count: int
    unknown_owner_vm_count: int
    review_needed_vm_count: int
    license_count: int
    renewal_review_count: int
    permission_count: int
    high_risk_permission_count: int
    agent_session_count: int
    agent_sessions_needing_review: int
    action_log_count: int
    pending_approval_count: int
    failed_action_count: int
    loaded_at: datetime


class FeatureModuleConfig(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: FeatureModuleId
    label: str
    enabled: bool
    show_in_overview: bool = Field(
        validation_alias=AliasChoices("show_in_overview", "showInOverview"),
        serialization_alias="showInOverview",
    )
    description: str


class NavigationItemConfig(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: ViewId
    label: str
    module_id: FeatureModuleId | None = Field(
        default=None,
        validation_alias=AliasChoices("module_id", "moduleId"),
        serialization_alias="moduleId",
    )


class OverviewWidgetConfig(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: OverviewWidgetId
    label: str
    module_id: FeatureModuleId | None = Field(
        default=None,
        validation_alias=AliasChoices("module_id", "moduleId"),
        serialization_alias="moduleId",
    )
    default_visible: bool = Field(
        validation_alias=AliasChoices("default_visible", "defaultVisible"),
        serialization_alias="defaultVisible",
    )


class PreferencesConfig(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    overview_widget_storage_key: str = Field(
        validation_alias=AliasChoices("overview_widget_storage_key", "overviewWidgetStorageKey"),
        serialization_alias="overviewWidgetStorageKey",
    )


class AppConfig(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    modules: dict[FeatureModuleId, FeatureModuleConfig]
    preferences: PreferencesConfig
    navigation_items: list[NavigationItemConfig] = Field(
        validation_alias=AliasChoices("navigation_items", "navigationItems"),
        serialization_alias="navigationItems",
    )
    overview_widgets: list[OverviewWidgetConfig] = Field(
        validation_alias=AliasChoices("overview_widgets", "overviewWidgets"),
        serialization_alias="overviewWidgets",
    )

    @model_validator(mode="after")
    def validate_module_references(self):
        for module_id, module_config in self.modules.items():
            if module_id != module_config.id:
                raise ValueError(f"module key {module_id!r} does not match id {module_config.id!r}")

        for item in [*self.navigation_items, *self.overview_widgets]:
            if item.module_id is not None and item.module_id not in self.modules:
                raise ValueError(f"unknown module reference {item.module_id!r}")

        return self
