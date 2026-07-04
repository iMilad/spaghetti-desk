import {
  Activity,
  ArrowDown,
  ArrowUp,
  Bot,
  Boxes,
  Database,
  KeyRound,
  LayoutDashboard,
  Maximize2,
  Minimize2,
  RefreshCcw,
  Search,
  Server,
  Settings2,
  ShieldAlert,
  TimerReset,
  Workflow,
} from "lucide-react";
import type { ReactNode } from "react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";

import { fetchDashboard, fetchInitialAppData } from "./api";
import {
  defaultAppConfig,
  getAvailableOverviewWidgets,
  getDefaultOverviewWidgetIds,
  getEnabledNavigationItems,
} from "./moduleConfig";
import type {
  AppConfig,
  FeatureModuleConfig,
  OverviewWidgetConfig,
  OverviewWidgetId,
  ViewId,
} from "./moduleConfig";
import type { AgentSession, DashboardData, License, Permission, Service, VM } from "./types";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; appConfig: AppConfig; data: DashboardData; refreshing: boolean }
  | { status: "error"; message: string };

type Tone = "ok" | "warning" | "risk";

type TableRow = {
  id: string;
  cells: string[];
  tone?: Tone;
  badgeIndex?: number;
};

type WidgetSize = "standard" | "wide";

type OverviewWidgetPreference = {
  id: OverviewWidgetId;
  size: WidgetSize;
};

const viewDetails: Record<ViewId, { title: string; description: string }> = {
  overview: {
    title: "Overview",
    description: "Composable control-center widgets backed by local inventory state.",
  },
  services: {
    title: "Services",
    description: "Dedicated service inventory page for ownership, monitoring, and risk.",
  },
  vms: {
    title: "VMs",
    description: "Dedicated VM ownership page for review status, patch state, and teams.",
  },
  licenses: {
    title: "Licenses",
    description: "Dedicated renewal page for license, support, certificate, and token risk.",
  },
  permissions: {
    title: "Permissions",
    description: "Dedicated permission-risk page for stale access and privileged roles.",
  },
  agents: {
    title: "Agents",
    description: "Dedicated agent session page for approvals, commands, and outcomes.",
  },
};

export default function App() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const loadDashboard = useCallback((mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") {
      setState({ status: "loading" });
    } else {
      setState((current) =>
        current.status === "ready" ? { ...current, refreshing: true } : current,
      );
    }

    const load =
      mode === "initial"
        ? fetchInitialAppData()
        : fetchDashboard().then((dashboard) => ({ appConfig: null, dashboard }));

    return load
      .then(({ appConfig, dashboard }) => {
        setState((current) => {
          if (appConfig) {
            return { status: "ready", appConfig, data: dashboard, refreshing: false };
          }

          return current.status === "ready"
            ? { ...current, data: dashboard, refreshing: false }
            : current;
        });
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Unable to load dashboard";
        setState({ status: "error", message });
      });
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const refresh = useCallback(() => {
    void loadDashboard("refresh");
  }, [loadDashboard]);

  if (state.status === "loading") {
    return <LoadingDashboard />;
  }

  if (state.status === "error") {
    return (
      <DashboardFrame activeView="overview" onNavigate={() => undefined}>
        <section className="empty-state error" role="alert">
          <strong>Inventory unavailable</strong>
          <span>{state.message}</span>
          <button className="text-button" type="button" onClick={() => void loadDashboard()}>
            Retry
          </button>
        </section>
      </DashboardFrame>
    );
  }

  return (
    <Dashboard
      appConfig={state.appConfig}
      data={state.data}
      refreshing={state.refreshing}
      onRefresh={refresh}
    />
  );
}

export function Dashboard({
  appConfig = defaultAppConfig,
  data,
  refreshing = false,
  onRefresh = () => undefined,
}: {
  appConfig?: AppConfig;
  data: DashboardData;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const enabledNavigationItems = useMemo(
    () => getEnabledNavigationItems(appConfig),
    [appConfig],
  );
  const availableOverviewWidgets = useMemo(
    () => getAvailableOverviewWidgets(appConfig),
    [appConfig],
  );
  const availableOverviewWidgetIds = useMemo(
    () => new Set(availableOverviewWidgets.map((widget) => widget.id)),
    [availableOverviewWidgets],
  );
  const defaultOverviewWidgetIds = useMemo(
    () => getDefaultOverviewWidgetIds(appConfig),
    [appConfig],
  );
  const overviewWidgetStorageKey = appConfig.preferences.overviewWidgetStorageKey;
  const [activeView, setActiveView] = useState<ViewId>(() =>
    getInitialView(enabledNavigationItems),
  );
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [widgetPreferences, setWidgetPreferences] = useState<OverviewWidgetPreference[]>(() =>
    loadOverviewWidgetPreferences(
      overviewWidgetStorageKey,
      defaultOverviewWidgetIds,
      availableOverviewWidgetIds,
    ),
  );
  const updatedAt = useMemo(() => formatTimestamp(data.summary.loaded_at), [data.summary.loaded_at]);

  useEffect(() => {
    const syncFromLocation = () => {
      setActiveView(getInitialView(enabledNavigationItems));
    };

    window.addEventListener("hashchange", syncFromLocation);
    window.addEventListener("popstate", syncFromLocation);
    return () => {
      window.removeEventListener("hashchange", syncFromLocation);
      window.removeEventListener("popstate", syncFromLocation);
    };
  }, [enabledNavigationItems]);

  useEffect(() => {
    setWidgetPreferences((current) =>
      current.filter((preference) => availableOverviewWidgetIds.has(preference.id)),
    );
  }, [availableOverviewWidgetIds]);

  useEffect(() => {
    if (!isEnabledView(activeView, enabledNavigationItems)) {
      setActiveView("overview");
    }
  }, [activeView, enabledNavigationItems]);

  useEffect(() => {
    localStorage.setItem(
      overviewWidgetStorageKey,
      JSON.stringify({ widgets: widgetPreferences }),
    );
  }, [overviewWidgetStorageKey, widgetPreferences]);

  const navigate = useCallback((view: ViewId) => {
    if (!isEnabledView(view, enabledNavigationItems)) {
      return;
    }

    setActiveView(view);
    const nextHash = `#${view}`;
    if (window.location.hash !== nextHash) {
      window.history.pushState(null, "", nextHash);
    }
  }, [enabledNavigationItems]);

  const toggleWidget = useCallback((widgetId: OverviewWidgetId) => {
    setWidgetPreferences((current) => {
      if (current.some((preference) => preference.id === widgetId)) {
        return current.filter((preference) => preference.id !== widgetId);
      }
      return [...current, { id: widgetId, size: "standard" }];
    });
  }, []);

  const resetWidgets = useCallback(() => {
    setWidgetPreferences(defaultOverviewWidgetIds.map((id) => ({ id, size: "standard" })));
  }, [defaultOverviewWidgetIds]);

  const moveWidget = useCallback((widgetId: OverviewWidgetId, direction: -1 | 1) => {
    setWidgetPreferences((current) => {
      const index = current.findIndex((preference) => preference.id === widgetId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const [preference] = next.splice(index, 1);
      next.splice(nextIndex, 0, preference);
      return next;
    });
  }, []);

  const toggleWidgetSize = useCallback((widgetId: OverviewWidgetId) => {
    setWidgetPreferences((current) =>
      current.map((preference) =>
        preference.id === widgetId
          ? { ...preference, size: preference.size === "wide" ? "standard" : "wide" }
          : preference,
      ),
    );
  }, []);

  const visibleWidgetPreferences = widgetPreferences.filter((preference) =>
    availableOverviewWidgetIds.has(preference.id),
  );

  return (
    <DashboardFrame
      activeView={activeView}
      navigationItems={enabledNavigationItems}
      onNavigate={navigate}
    >
      <TopBar
        activeView={activeView}
        updatedAt={updatedAt}
        refreshing={refreshing}
        onRefresh={onRefresh}
      />

      {activeView === "overview" ? (
        <OverviewPage
          data={data}
          customizerOpen={customizerOpen}
          widgetPreferences={visibleWidgetPreferences}
          appConfig={appConfig}
          availableOverviewWidgets={availableOverviewWidgets}
          onToggleCustomizer={() => setCustomizerOpen((current) => !current)}
          onToggleWidget={toggleWidget}
          onMoveWidget={moveWidget}
          onResetWidgets={resetWidgets}
          onToggleWidgetSize={toggleWidgetSize}
        />
      ) : null}
      {activeView === "services" ? (
        <ServicesPage moduleConfig={appConfig.modules.services} services={data.services} />
      ) : null}
      {activeView === "vms" ? (
        <VMsPage moduleConfig={appConfig.modules.vms} vms={data.vms} />
      ) : null}
      {activeView === "licenses" ? (
        <LicensesPage moduleConfig={appConfig.modules.licenses} licenses={data.licenses} />
      ) : null}
      {activeView === "permissions" ? (
        <PermissionsPage
          moduleConfig={appConfig.modules.permissions}
          permissions={data.permissions}
        />
      ) : null}
      {activeView === "agents" ? (
        <AgentsPage moduleConfig={appConfig.modules.agents} sessions={data.agentSessions} />
      ) : null}
    </DashboardFrame>
  );
}

function OverviewPage({
  data,
  customizerOpen,
  widgetPreferences,
  appConfig,
  availableOverviewWidgets,
  onToggleCustomizer,
  onToggleWidget,
  onMoveWidget,
  onResetWidgets,
  onToggleWidgetSize,
}: {
  data: DashboardData;
  customizerOpen: boolean;
  widgetPreferences: OverviewWidgetPreference[];
  appConfig: AppConfig;
  availableOverviewWidgets: OverviewWidgetConfig[];
  onToggleCustomizer: () => void;
  onToggleWidget: (widgetId: OverviewWidgetId) => void;
  onMoveWidget: (widgetId: OverviewWidgetId, direction: -1 | 1) => void;
  onResetWidgets: () => void;
  onToggleWidgetSize: (widgetId: OverviewWidgetId) => void;
}) {
  return (
    <>
      <section className="section-toolbar" aria-label="Overview controls">
        <div>
          <h2>Overview widgets</h2>
          <p>Choose the components this deployment should show on the overview.</p>
        </div>
        <button
          className="text-button with-icon"
          type="button"
          aria-expanded={customizerOpen}
          onClick={onToggleCustomizer}
        >
          <Settings2 aria-hidden="true" />
          Customize overview
        </button>
      </section>

      {customizerOpen ? (
        <WidgetCustomizer
          modules={appConfig.modules}
          availableOverviewWidgets={availableOverviewWidgets}
          widgetPreferences={widgetPreferences}
          onToggleWidget={onToggleWidget}
          onMoveWidget={onMoveWidget}
          onResetWidgets={onResetWidgets}
          onToggleWidgetSize={onToggleWidgetSize}
        />
      ) : null}

      {widgetPreferences.length > 0 ? (
        <section className="widget-grid" aria-label="Selected overview widgets">
          {widgetPreferences.map((preference) => (
            <OverviewWidget
              key={preference.id}
              widgetId={preference.id}
              size={preference.size}
              data={data}
              appConfig={appConfig}
            />
          ))}
        </section>
      ) : (
        <section className="empty-state">
          <strong>No overview widgets selected</strong>
          <span>Open the customizer and select the modules this deployment needs.</span>
        </section>
      )}
    </>
  );
}

function WidgetCustomizer({
  modules,
  availableOverviewWidgets,
  widgetPreferences,
  onToggleWidget,
  onMoveWidget,
  onResetWidgets,
  onToggleWidgetSize,
}: {
  modules: AppConfig["modules"];
  availableOverviewWidgets: OverviewWidgetConfig[];
  widgetPreferences: OverviewWidgetPreference[];
  onToggleWidget: (widgetId: OverviewWidgetId) => void;
  onMoveWidget: (widgetId: OverviewWidgetId, direction: -1 | 1) => void;
  onResetWidgets: () => void;
  onToggleWidgetSize: (widgetId: OverviewWidgetId) => void;
}) {
  const preferenceById = new Map(widgetPreferences.map((preference) => [preference.id, preference]));

  return (
    <section className="customizer-panel" aria-label="Overview widget customizer">
      <div className="customizer-options">
        {availableOverviewWidgets.map((widget) => {
          const preference = preferenceById.get(widget.id);
          const selected = Boolean(preference);
          return (
            <div className="widget-option" key={widget.id}>
              <label className="widget-choice">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggleWidget(widget.id)}
                />
                <span>
                  <strong>{widget.label}</strong>
                  <small>
                    {widget.moduleId ? modules[widget.moduleId].description : "Core app state"}
                  </small>
                </span>
              </label>
              {selected ? (
                <div className="widget-actions" aria-label={`${widget.label} layout controls`}>
                  <button
                    className="mini-icon-button"
                    type="button"
                    aria-label={`Move ${widget.label} up`}
                    title={`Move ${widget.label} up`}
                    onClick={() => onMoveWidget(widget.id, -1)}
                  >
                    <ArrowUp aria-hidden="true" />
                  </button>
                  <button
                    className="mini-icon-button"
                    type="button"
                    aria-label={`Move ${widget.label} down`}
                    title={`Move ${widget.label} down`}
                    onClick={() => onMoveWidget(widget.id, 1)}
                  >
                    <ArrowDown aria-hidden="true" />
                  </button>
                  <button
                    className="mini-icon-button"
                    type="button"
                    aria-label={
                      preference?.size === "wide"
                        ? `Make ${widget.label} standard`
                        : `Make ${widget.label} wide`
                    }
                    title={
                      preference?.size === "wide"
                        ? `Make ${widget.label} standard`
                        : `Make ${widget.label} wide`
                    }
                    onClick={() => onToggleWidgetSize(widget.id)}
                  >
                    {preference?.size === "wide" ? (
                      <Minimize2 aria-hidden="true" />
                    ) : (
                      <Maximize2 aria-hidden="true" />
                    )}
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <button className="text-button" type="button" onClick={onResetWidgets}>
        Restore defaults
      </button>
    </section>
  );
}

function OverviewWidget({
  widgetId,
  size,
  data,
  appConfig,
}: {
  widgetId: OverviewWidgetId;
  size: WidgetSize;
  data: DashboardData;
  appConfig: AppConfig;
}) {
  switch (widgetId) {
    case "runtime-model":
      return <RuntimeModelWidget appConfig={appConfig} size={size} />;
    case "service-health":
      return <ServiceHealthWidget data={data} size={size} />;
    case "vm-ownership":
      return <VMOwnershipWidget data={data} size={size} />;
    case "license-renewals":
      return <LicenseRenewalWidget data={data} size={size} />;
    case "permission-risk":
      return <PermissionRiskWidget data={data} size={size} />;
    case "agent-activity":
      return <AgentActivityWidget data={data} size={size} />;
  }
}

function RuntimeModelWidget({
  appConfig,
  size,
}: {
  appConfig: AppConfig;
  size: WidgetSize;
}) {
  return (
    <WidgetPanel
      title="Runtime model"
      size={size}
      icon={<Database aria-hidden="true" />}
      description="Fast local reads first; collectors and actions are separate boundaries."
    >
      <div className="runtime-stack">
        <RuntimeItem
          icon={<Database aria-hidden="true" />}
          label="Read Model"
          value="Cached local inventory"
        />
        <RuntimeItem
          icon={<Workflow aria-hidden="true" />}
          label="Collectors"
          value="Scheduled sync boundary"
        />
        <RuntimeItem
          icon={<ShieldAlert aria-hidden="true" />}
          label="Actions"
          value="Approval and audit first"
        />
        <RuntimeItem
          icon={<Boxes aria-hidden="true" />}
          label="Enabled Modules"
          value={`${Object.values(appConfig.modules).filter((module) => module.enabled).length} active`}
        />
      </div>
    </WidgetPanel>
  );
}

function ServiceHealthWidget({ data, size }: { data: DashboardData; size: WidgetSize }) {
  return (
    <WidgetPanel
      title="Services snapshot"
      size={size}
      icon={<Activity aria-hidden="true" />}
      description={`${data.summary.degraded_service_count} degraded of ${data.summary.service_count} services.`}
    >
      <Metric
        icon={<Activity aria-hidden="true" />}
        label="Services"
        value={data.summary.service_count}
        detail={`${data.summary.degraded_service_count} degraded`}
        tone={data.summary.degraded_service_count > 0 ? "warning" : "ok"}
        fill={ratio(data.summary.degraded_service_count, data.summary.service_count)}
      />
      <InventoryTable
        title="Service health"
        compact
        columns={["Name", "Owner", "Status"]}
        rows={serviceRows(data.services.slice(0, 4), true)}
      />
    </WidgetPanel>
  );
}

function VMOwnershipWidget({ data, size }: { data: DashboardData; size: WidgetSize }) {
  const reviewRows = data.vms
    .filter((vm) => vm.review_status !== "active")
    .slice(0, 4);
  const rows = reviewRows.length > 0 ? reviewRows : data.vms.slice(0, 4);

  return (
    <WidgetPanel
      title="VM ownership"
      size={size}
      icon={<Server aria-hidden="true" />}
      description={`${data.summary.review_needed_vm_count} VMs need review or cleanup.`}
    >
      <Metric
        icon={<Server aria-hidden="true" />}
        label="VMs"
        value={data.summary.vm_count}
        detail={`${data.summary.review_needed_vm_count} need review`}
        tone={data.summary.review_needed_vm_count > 0 ? "warning" : "ok"}
        fill={ratio(data.summary.review_needed_vm_count, data.summary.vm_count)}
      />
      <InventoryTable
        title="VM review queue"
        compact
        columns={["Name", "Team", "Review"]}
        rows={vmRows(rows, true)}
      />
    </WidgetPanel>
  );
}

function LicenseRenewalWidget({ data, size }: { data: DashboardData; size: WidgetSize }) {
  return (
    <WidgetPanel
      title="License renewals"
      size={size}
      icon={<TimerReset aria-hidden="true" />}
      description={`${data.summary.renewal_review_count} renewal items need attention.`}
    >
      <Metric
        icon={<TimerReset aria-hidden="true" />}
        label="Renewals"
        value={data.summary.license_count}
        detail={`${data.summary.renewal_review_count} pending`}
        tone={data.summary.renewal_review_count > 0 ? "warning" : "ok"}
        fill={ratio(data.summary.renewal_review_count, data.summary.license_count)}
      />
      <InventoryTable
        title="Upcoming expiry"
        compact
        columns={["Name", "Expires", "Status"]}
        rows={licenseRows(data.licenses.slice(0, 4), true)}
      />
    </WidgetPanel>
  );
}

function PermissionRiskWidget({ data, size }: { data: DashboardData; size: WidgetSize }) {
  return (
    <WidgetPanel
      title="Permission risk"
      size={size}
      icon={<KeyRound aria-hidden="true" />}
      description={`${data.summary.high_risk_permission_count} high-risk permissions detected.`}
    >
      <Metric
        icon={<KeyRound aria-hidden="true" />}
        label="Permissions"
        value={data.summary.permission_count}
        detail={`${data.summary.high_risk_permission_count} high risk`}
        tone={data.summary.high_risk_permission_count > 0 ? "risk" : "ok"}
        fill={ratio(data.summary.high_risk_permission_count, data.summary.permission_count)}
      />
      <InventoryTable
        title="Permission risk"
        compact
        columns={["Principal", "System", "Risk"]}
        rows={permissionRows(data.permissions.slice(0, 4), true)}
      />
    </WidgetPanel>
  );
}

function AgentActivityWidget({ data, size }: { data: DashboardData; size: WidgetSize }) {
  return (
    <WidgetPanel
      title="Agent activity"
      size={size}
      icon={<Bot aria-hidden="true" />}
      description={`${data.summary.agent_sessions_needing_review} sessions need review.`}
    >
      <Metric
        icon={<Bot aria-hidden="true" />}
        label="Agent Sessions"
        value={data.summary.agent_session_count}
        detail={`${data.summary.agent_sessions_needing_review} need review`}
        tone={data.summary.agent_sessions_needing_review > 0 ? "warning" : "ok"}
        fill={ratio(
          data.summary.agent_sessions_needing_review,
          data.summary.agent_session_count,
        )}
      />
      <InventoryTable
        title="Agent activity"
        compact
        columns={["Session", "Target", "Status"]}
        rows={agentRows(data.agentSessions.slice(0, 4), true)}
      />
    </WidgetPanel>
  );
}

function ServicesPage({
  moduleConfig,
  services,
}: {
  moduleConfig: FeatureModuleConfig;
  services: Service[];
}) {
  const degraded = services.filter((service) => service.status !== "healthy").length;

  return (
    <section className="page-grid" aria-label="Services page">
      <FeatureIntro
        title={moduleConfig.label}
        description={moduleConfig.description}
        facts={[
          `${services.length} services`,
          `${degraded} degraded`,
          "Collectors update local state",
        ]}
      />
      <InventoryTable
        title="Service inventory"
        icon={<Activity aria-hidden="true" />}
        columns={["Name", "Type", "Owner", "Version", "Status", "Monitoring"]}
        rows={serviceRows(services)}
      />
    </section>
  );
}

function VMsPage({
  moduleConfig,
  vms,
}: {
  moduleConfig: FeatureModuleConfig;
  vms: VM[];
}) {
  const reviewNeeded = vms.filter((vm) => vm.review_status !== "active").length;
  const unknownOwners = vms.filter((vm) => vm.ownership_confidence === "unknown").length;

  return (
    <section className="page-grid" aria-label="VMs page">
      <FeatureIntro
        title={moduleConfig.label}
        description={moduleConfig.description}
        facts={[
          `${vms.length} VMs`,
          `${reviewNeeded} need review`,
          `${unknownOwners} unknown owners`,
        ]}
      />
      <InventoryTable
        title="VM ownership"
        icon={<Server aria-hidden="true" />}
        columns={["Name", "Owner", "Team", "Environment", "Capacity", "Patch", "Review"]}
        rows={vmRows(vms)}
      />
    </section>
  );
}

function LicensesPage({
  moduleConfig,
  licenses,
}: {
  moduleConfig: FeatureModuleConfig;
  licenses: License[];
}) {
  const reviewNeeded = licenses.filter(
    (license) => license.renewal_status !== "active",
  ).length;

  return (
    <section className="page-grid" aria-label="Licenses page">
      <FeatureIntro
        title={moduleConfig.label}
        description={moduleConfig.description}
        facts={[
          `${licenses.length} tracked items`,
          `${reviewNeeded} need review`,
          "Renewal risk first",
        ]}
      />
      <InventoryTable
        title="License renewals"
        icon={<TimerReset aria-hidden="true" />}
        columns={["Name", "Vendor", "Owner", "Expires", "Status", "Risk"]}
        rows={licenseRows(licenses)}
      />
    </section>
  );
}

function PermissionsPage({
  moduleConfig,
  permissions,
}: {
  moduleConfig: FeatureModuleConfig;
  permissions: Permission[];
}) {
  const highRisk = permissions.filter((permission) => permission.risk_level === "high").length;

  return (
    <section className="page-grid" aria-label="Permissions page">
      <FeatureIntro
        title={moduleConfig.label}
        description={moduleConfig.description}
        facts={[
          `${permissions.length} permissions`,
          `${highRisk} high risk`,
          "Review privileged access",
        ]}
      />
      <InventoryTable
        title="Permission inventory"
        icon={<KeyRound aria-hidden="true" />}
        columns={["Principal", "System", "Role", "Last seen", "Risk"]}
        rows={permissionRows(permissions)}
      />
    </section>
  );
}

function AgentsPage({
  moduleConfig,
  sessions,
}: {
  moduleConfig: FeatureModuleConfig;
  sessions: AgentSession[];
}) {
  const needsReview = sessions.filter((session) => session.status !== "completed").length;
  const approvals = sessions.filter((session) => session.approval_required).length;

  return (
    <section className="page-grid" aria-label="Agents page">
      <FeatureIntro
        title={moduleConfig.label}
        description={moduleConfig.description}
        facts={[
          `${sessions.length} sessions`,
          `${needsReview} need review`,
          `${approvals} approval-gated`,
        ]}
      />
      <InventoryTable
        title="Agent sessions"
        icon={<Bot aria-hidden="true" />}
        columns={["Session", "Target", "Status", "Approval", "Outcome"]}
        rows={agentRows(sessions)}
      />
    </section>
  );
}

function DashboardFrame({
  activeView,
  navigationItems = getEnabledNavigationItems(defaultAppConfig),
  onNavigate,
  children,
}: {
  activeView: ViewId;
  navigationItems?: ReturnType<typeof getEnabledNavigationItems>;
  onNavigate: (view: ViewId) => void;
  children: ReactNode;
}) {
  return (
    <div className="workspace-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <ShellNav
        activeView={activeView}
        navigationItems={navigationItems}
        onNavigate={onNavigate}
      />
      <main className="app-shell" id="main-content">
        {children}
      </main>
    </div>
  );
}

function ShellNav({
  activeView,
  navigationItems,
  onNavigate,
}: {
  activeView: ViewId;
  navigationItems: ReturnType<typeof getEnabledNavigationItems>;
  onNavigate: (view: ViewId) => void;
}) {
  return (
    <aside className="side-nav" aria-label="Primary">
      <div className="brand-block">
        <div className="brand-mark" aria-hidden="true">
          SD
        </div>
        <div>
          <strong>Spaghetti Desk</strong>
          <span>Control Center</span>
        </div>
      </div>
      <nav>
        {navigationItems.map((item) => (
          <button
            className={`nav-item ${activeView === item.id ? "active" : ""}`}
            type="button"
            key={item.id}
            aria-current={activeView === item.id ? "page" : undefined}
            onClick={() => onNavigate(item.id)}
          >
            {navIcon(item.id)}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

function TopBar({
  activeView,
  updatedAt,
  refreshing,
  onRefresh,
}: {
  activeView: ViewId;
  updatedAt: string;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const details = viewDetails[activeView];

  return (
    <header className="top-bar">
      <div>
        <p className="eyebrow">Spaghetti Desk</p>
        <h1>{details.title}</h1>
        <p className="status-line">
          {details.description} Demo inventory loaded {updatedAt}.
        </p>
      </div>
      <button
        className="icon-button"
        type="button"
        aria-label={refreshing ? "Refreshing inventory" : "Refresh inventory"}
        disabled={refreshing}
        onClick={onRefresh}
      >
        <RefreshCcw aria-hidden="true" className={refreshing ? "spin" : undefined} />
      </button>
    </header>
  );
}

function WidgetPanel({
  title,
  size,
  icon,
  description,
  children,
}: {
  title: string;
  size: WidgetSize;
  icon: ReactNode;
  description: string;
  children: ReactNode;
}) {
  return (
    <article
      className={`widget-panel ${size === "wide" ? "widget-wide" : ""}`}
      aria-label={`${title} widget`}
    >
      <div className="panel-heading">
        <span>{icon}</span>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <div className="widget-body">{children}</div>
    </article>
  );
}

function FeatureIntro({
  title,
  description,
  facts,
}: {
  title: string;
  description: string;
  facts: string[];
}) {
  return (
    <section className="feature-intro">
      <div>
        <p className="eyebrow">Module page</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="fact-row">
        {facts.map((fact) => (
          <span key={fact}>{fact}</span>
        ))}
      </div>
    </section>
  );
}

function Metric({
  icon,
  label,
  value,
  detail,
  tone,
  fill,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  detail: string;
  tone: Tone;
  fill: number;
}) {
  return (
    <article className={`metric metric-${tone}`}>
      <div className="metric-icon">{icon}</div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{detail}</span>
        <div className="metric-bar" aria-hidden="true">
          <i style={{ width: `${fill}%` }} />
        </div>
      </div>
    </article>
  );
}

function RuntimeItem({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <article className="runtime-item">
      <span>{icon}</span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

const InventoryTable = memo(function InventoryTable({
  title,
  icon,
  columns,
  rows,
  compact = false,
}: {
  title: string;
  icon?: ReactNode;
  columns: string[];
  rows: TableRow[];
  compact?: boolean;
}) {
  const id = title.toLowerCase().replace(/\s+/g, "-");
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleRows = useMemo(() => {
    if (compact || !normalizedQuery) {
      return rows;
    }

    return rows.filter((row) =>
      row.cells.some((cell) => cell.toLowerCase().includes(normalizedQuery)),
    );
  }, [compact, normalizedQuery, rows]);

  return (
    <section className={`table-panel ${compact ? "compact" : ""}`} id={id}>
      {!compact ? (
        <div className="panel-heading">
          <span>{icon}</span>
          <div>
            <h2>{title}</h2>
          </div>
          <label className="table-search">
            <Search aria-hidden="true" />
            <input
              type="search"
              aria-label={`Search ${title}`}
              value={query}
              placeholder="Search"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>
      ) : null}
      {visibleRows.length > 0 ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const badgeIndex = row.badgeIndex ?? row.cells.length - 1;
                return (
                  <tr key={row.id} className={row.tone ? `row-${row.tone}` : undefined}>
                    {row.cells.map((cell, index) => (
                      <td key={`${row.id}-${columns[index]}`}>
                        {index === badgeIndex ? (
                          <span className={`status-pill ${row.tone ?? "ok"}`}>{cell}</span>
                        ) : (
                          cell
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-empty">
          <strong>No matching rows</strong>
          <span>{compact ? "No rows available." : "Clear the search or adjust the filter."}</span>
        </div>
      )}
    </section>
  );
});

function LoadingDashboard() {
  return (
    <DashboardFrame activeView="overview" onNavigate={() => undefined}>
      <header className="top-bar">
        <div>
          <p className="eyebrow">Spaghetti Desk</p>
          <h1>Overview</h1>
          <p className="status-line">Loading local inventory state.</p>
        </div>
        <div className="icon-button skeleton-button" aria-hidden="true" />
      </header>

      <section className="widget-grid" aria-label="Loading widgets">
        {Array.from({ length: 4 }, (_, index) => (
          <article className="widget-panel skeleton-table" key={index} aria-hidden="true" />
        ))}
      </section>
    </DashboardFrame>
  );
}

function serviceRows(services: Service[], compact = false): TableRow[] {
  return services.map((service) => ({
    id: service.id,
    tone: service.status === "healthy" ? "ok" : "warning",
    badgeIndex: compact ? 2 : 4,
    cells: compact
      ? [service.name, service.owner_team, service.status]
      : [
          service.name,
          service.service_type,
          service.owner_team,
          service.version,
          service.status,
          service.monitoring_status,
        ],
  }));
}

function vmRows(vms: VM[], compact = false): TableRow[] {
  return vms.map((vm) => ({
    id: vm.id,
    tone: vm.review_status === "active" ? "ok" : "warning",
    badgeIndex: compact ? 2 : 6,
    cells: compact
      ? [vm.name, vm.team, vm.review_status]
      : [
          vm.name,
          vm.owner,
          vm.team,
          vm.environment,
          `${vm.cpu} CPU / ${vm.ram_gb} GB`,
          vm.patch_status,
          vm.review_status,
        ],
  }));
}

function licenseRows(licenses: License[], compact = false): TableRow[] {
  return [...licenses]
    .sort((left, right) => left.expires_on.localeCompare(right.expires_on))
    .map((license) => ({
      id: license.id,
      tone: license.renewal_status === "active" ? "ok" : "warning",
      badgeIndex: compact ? 2 : 4,
      cells: compact
        ? [license.name, license.expires_on, license.renewal_status]
        : [
            license.name,
            license.vendor,
            license.owner_team,
            license.expires_on,
            license.renewal_status,
            license.risk,
          ],
    }));
}

function permissionRows(permissions: Permission[], compact = false): TableRow[] {
  return permissions.map((permission) => ({
    id: permission.id,
    tone: permission.risk_level === "high" ? "risk" : "ok",
    badgeIndex: compact ? 2 : 4,
    cells: compact
      ? [permission.principal, permission.system, permission.risk_level]
      : [
          permission.principal,
          permission.system,
          permission.role,
          formatTimestamp(permission.last_seen_at),
          permission.risk_level,
        ],
  }));
}

function agentRows(sessions: AgentSession[], compact = false): TableRow[] {
  return sessions.map((session) => ({
    id: session.id,
    tone: session.status === "completed" ? "ok" : "warning",
    badgeIndex: compact ? 2 : 2,
    cells: compact
      ? [session.id, session.target, session.status]
      : [
          session.id,
          session.target,
          session.status,
          session.approval_required ? "required" : "not required",
          session.outcome,
        ],
  }));
}

function navIcon(view: ViewId) {
  switch (view) {
    case "overview":
      return <LayoutDashboard aria-hidden="true" />;
    case "services":
      return <Activity aria-hidden="true" />;
    case "vms":
      return <Server aria-hidden="true" />;
    case "licenses":
      return <TimerReset aria-hidden="true" />;
    case "permissions":
      return <KeyRound aria-hidden="true" />;
    case "agents":
      return <Bot aria-hidden="true" />;
  }
}

function isEnabledView(
  view: ViewId,
  enabledNavigationItems: ReturnType<typeof getEnabledNavigationItems>,
) {
  return enabledNavigationItems.some((item) => item.id === view);
}

function getInitialView(
  enabledNavigationItems: ReturnType<typeof getEnabledNavigationItems>,
): ViewId {
  if (typeof window === "undefined") {
    return "overview";
  }

  const hashView = window.location.hash.replace("#", "") as ViewId;
  return isEnabledView(hashView, enabledNavigationItems) ? hashView : "overview";
}

function loadOverviewWidgetPreferences(
  overviewWidgetStorageKey: string,
  defaultOverviewWidgetIds: OverviewWidgetId[],
  availableOverviewWidgetIds: Set<OverviewWidgetId>,
): OverviewWidgetPreference[] {
  const defaultPreferences = defaultOverviewWidgetIds.map((id) => ({
    id,
    size: "standard" as const,
  }));

  if (typeof window === "undefined") {
    return defaultPreferences;
  }

  const stored = localStorage.getItem(overviewWidgetStorageKey);
  if (!stored) {
    return defaultPreferences;
  }

  try {
    const parsed = JSON.parse(stored);
    const storedWidgets = Array.isArray(parsed) ? parsed : parsed?.widgets;
    if (!Array.isArray(storedWidgets)) {
      return defaultPreferences;
    }

    const preferences = storedWidgets
      .map((storedWidget): OverviewWidgetPreference | null => {
        const widgetId =
          typeof storedWidget === "string" ? storedWidget : storedWidget?.id;
        if (!availableOverviewWidgetIds.has(widgetId)) {
          return null;
        }

        return {
          id: widgetId,
          size: storedWidget?.size === "wide" ? "wide" : "standard",
        };
      })
      .filter((preference): preference is OverviewWidgetPreference => preference !== null);

    return preferences.length > 0 ? preferences : defaultPreferences;
  } catch {
    return defaultPreferences;
  }
}

function ratio(value: number, total: number) {
  if (total <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(4, Math.round((value / total) * 100)));
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
