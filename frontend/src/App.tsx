import {
  Activity,
  Bot,
  Boxes,
  Database,
  KeyRound,
  LayoutDashboard,
  RefreshCcw,
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

const overviewWidgetStorageKey = "spaghetti-desk.overview-widgets";

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
  const [activeView, setActiveView] = useState<ViewId>(() =>
    getInitialView(enabledNavigationItems),
  );
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [selectedWidgetIds, setSelectedWidgetIds] = useState<OverviewWidgetId[]>(() =>
    loadOverviewWidgetSelection(defaultOverviewWidgetIds, availableOverviewWidgetIds),
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
    setSelectedWidgetIds((current) =>
      current.filter((widgetId) => availableOverviewWidgetIds.has(widgetId)),
    );
  }, [availableOverviewWidgetIds]);

  useEffect(() => {
    if (!isEnabledView(activeView, enabledNavigationItems)) {
      setActiveView("overview");
    }
  }, [activeView, enabledNavigationItems]);

  useEffect(() => {
    localStorage.setItem(overviewWidgetStorageKey, JSON.stringify(selectedWidgetIds));
  }, [selectedWidgetIds]);

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
    setSelectedWidgetIds((current) => {
      if (current.includes(widgetId)) {
        return current.filter((id) => id !== widgetId);
      }
      return [...current, widgetId];
    });
  }, []);

  const resetWidgets = useCallback(() => {
    setSelectedWidgetIds(defaultOverviewWidgetIds);
  }, [defaultOverviewWidgetIds]);

  const visibleWidgetIds = selectedWidgetIds.filter((widgetId) =>
    availableOverviewWidgetIds.has(widgetId),
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
          selectedWidgetIds={visibleWidgetIds}
          appConfig={appConfig}
          availableOverviewWidgets={availableOverviewWidgets}
          onToggleCustomizer={() => setCustomizerOpen((current) => !current)}
          onToggleWidget={toggleWidget}
          onResetWidgets={resetWidgets}
        />
      ) : null}
      {activeView === "services" ? (
        <ServicesPage moduleConfig={appConfig.modules.services} services={data.services} />
      ) : null}
      {activeView === "vms" ? (
        <VMsPage moduleConfig={appConfig.modules.vms} vms={data.vms} />
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
  selectedWidgetIds,
  appConfig,
  availableOverviewWidgets,
  onToggleCustomizer,
  onToggleWidget,
  onResetWidgets,
}: {
  data: DashboardData;
  customizerOpen: boolean;
  selectedWidgetIds: OverviewWidgetId[];
  appConfig: AppConfig;
  availableOverviewWidgets: OverviewWidgetConfig[];
  onToggleCustomizer: () => void;
  onToggleWidget: (widgetId: OverviewWidgetId) => void;
  onResetWidgets: () => void;
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
          selectedWidgetIds={selectedWidgetIds}
          onToggleWidget={onToggleWidget}
          onResetWidgets={onResetWidgets}
        />
      ) : null}

      {selectedWidgetIds.length > 0 ? (
        <section className="widget-grid" aria-label="Selected overview widgets">
          {selectedWidgetIds.map((widgetId) => (
            <OverviewWidget
              key={widgetId}
              widgetId={widgetId}
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
  selectedWidgetIds,
  onToggleWidget,
  onResetWidgets,
}: {
  modules: AppConfig["modules"];
  availableOverviewWidgets: OverviewWidgetConfig[];
  selectedWidgetIds: OverviewWidgetId[];
  onToggleWidget: (widgetId: OverviewWidgetId) => void;
  onResetWidgets: () => void;
}) {
  return (
    <section className="customizer-panel" aria-label="Overview widget customizer">
      <div className="customizer-options">
        {availableOverviewWidgets.map((widget) => (
          <label className="widget-option" key={widget.id}>
            <input
              type="checkbox"
              checked={selectedWidgetIds.includes(widget.id)}
              onChange={() => onToggleWidget(widget.id)}
            />
            <span>
              <strong>{widget.label}</strong>
              <small>{widget.moduleId ? modules[widget.moduleId].description : "Core app state"}</small>
            </span>
          </label>
        ))}
      </div>
      <button className="text-button" type="button" onClick={onResetWidgets}>
        Restore defaults
      </button>
    </section>
  );
}

function OverviewWidget({
  widgetId,
  data,
  appConfig,
}: {
  widgetId: OverviewWidgetId;
  data: DashboardData;
  appConfig: AppConfig;
}) {
  switch (widgetId) {
    case "runtime-model":
      return <RuntimeModelWidget appConfig={appConfig} />;
    case "service-health":
      return <ServiceHealthWidget data={data} />;
    case "vm-ownership":
      return <VMOwnershipWidget data={data} />;
    case "license-renewals":
      return <LicenseRenewalWidget data={data} />;
    case "permission-risk":
      return <PermissionRiskWidget data={data} />;
    case "agent-activity":
      return <AgentActivityWidget data={data} />;
  }
}

function RuntimeModelWidget({ appConfig }: { appConfig: AppConfig }) {
  return (
    <WidgetPanel
      title="Runtime model"
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

function ServiceHealthWidget({ data }: { data: DashboardData }) {
  return (
    <WidgetPanel
      title="Services snapshot"
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

function VMOwnershipWidget({ data }: { data: DashboardData }) {
  const reviewRows = data.vms
    .filter((vm) => vm.review_status !== "active")
    .slice(0, 4);
  const rows = reviewRows.length > 0 ? reviewRows : data.vms.slice(0, 4);

  return (
    <WidgetPanel
      title="VM ownership"
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

function LicenseRenewalWidget({ data }: { data: DashboardData }) {
  return (
    <WidgetPanel
      title="License renewals"
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

function PermissionRiskWidget({ data }: { data: DashboardData }) {
  return (
    <WidgetPanel
      title="Permission risk"
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

function AgentActivityWidget({ data }: { data: DashboardData }) {
  return (
    <WidgetPanel
      title="Agent activity"
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
  icon,
  description,
  children,
}: {
  title: string;
  icon: ReactNode;
  description: string;
  children: ReactNode;
}) {
  return (
    <article className="widget-panel">
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

  return (
    <section className={`table-panel ${compact ? "compact" : ""}`} id={id}>
      {!compact ? (
        <div className="panel-heading">
          <span>{icon}</span>
          <h2>{title}</h2>
        </div>
      ) : null}
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
            {rows.map((row) => {
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
      badgeIndex: compact ? 2 : 3,
      cells: compact
        ? [license.name, license.expires_on, license.renewal_status]
        : [license.name, license.owner_team, license.expires_on, license.renewal_status],
    }));
}

function permissionRows(permissions: Permission[], compact = false): TableRow[] {
  return permissions.map((permission) => ({
    id: permission.id,
    tone: permission.risk_level === "high" ? "risk" : "ok",
    badgeIndex: compact ? 2 : 3,
    cells: compact
      ? [permission.principal, permission.system, permission.risk_level]
      : [permission.principal, permission.system, permission.role, permission.risk_level],
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

function loadOverviewWidgetSelection(
  defaultOverviewWidgetIds: OverviewWidgetId[],
  availableOverviewWidgetIds: Set<OverviewWidgetId>,
): OverviewWidgetId[] {
  if (typeof window === "undefined") {
    return defaultOverviewWidgetIds;
  }

  const stored = localStorage.getItem(overviewWidgetStorageKey);
  if (!stored) {
    return defaultOverviewWidgetIds;
  }

  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return defaultOverviewWidgetIds;
    }

    const selected = parsed.filter((widgetId): widgetId is OverviewWidgetId =>
      availableOverviewWidgetIds.has(widgetId),
    );
    return selected.length > 0 ? selected : defaultOverviewWidgetIds;
  } catch {
    return defaultOverviewWidgetIds;
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
