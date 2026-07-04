from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, model_validator

FeatureModuleId = Literal["services", "vms", "licenses", "permissions", "agents"]
ViewId = Literal["overview", "services", "vms", "agents"]
OverviewWidgetId = Literal[
    "runtime-model",
    "service-health",
    "vm-ownership",
    "license-renewals",
    "permission-risk",
    "agent-activity",
]


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


class InventoryData(BaseModel):
    services: list[Service]
    vms: list[VM]
    licenses: list[License]
    permissions: list[Permission]
    agent_sessions: list[AgentSession]
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


class AppConfig(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    modules: dict[FeatureModuleId, FeatureModuleConfig]
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
