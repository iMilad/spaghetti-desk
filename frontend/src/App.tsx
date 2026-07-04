import {
  Activity,
  Bot,
  Boxes,
  Database,
  KeyRound,
  LayoutDashboard,
  RefreshCcw,
  Server,
  ShieldAlert,
  TimerReset,
  Workflow,
} from "lucide-react";
import type { ReactNode } from "react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";

import { fetchDashboard } from "./api";
import type { DashboardData } from "./types";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: DashboardData; refreshing: boolean }
  | { status: "error"; message: string };

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

    return fetchDashboard()
      .then((data) => {
        setState({ status: "ready", data, refreshing: false });
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
      <DashboardFrame>
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

  return <Dashboard data={state.data} refreshing={state.refreshing} onRefresh={refresh} />;
}

export function Dashboard({
  data,
  refreshing = false,
  onRefresh = () => undefined,
}: {
  data: DashboardData;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const updatedAt = useMemo(() => formatTimestamp(data.summary.loaded_at), [data.summary.loaded_at]);

  return (
    <DashboardFrame>
      <TopBar updatedAt={updatedAt} refreshing={refreshing} onRefresh={onRefresh} />

      <section className="ops-strip" aria-label="Runtime model">
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
      </section>

      <section className="summary-grid" aria-label="Inventory summary">
        <Metric
          icon={<Server aria-hidden="true" />}
          label="Services"
          value={data.summary.service_count}
          detail={`${data.summary.degraded_service_count} degraded`}
          tone={data.summary.degraded_service_count > 0 ? "warning" : "ok"}
          fill={ratio(data.summary.degraded_service_count, data.summary.service_count)}
        />
        <Metric
          icon={<Boxes aria-hidden="true" />}
          label="VMs"
          value={data.summary.vm_count}
          detail={`${data.summary.review_needed_vm_count} need review`}
          tone={data.summary.review_needed_vm_count > 0 ? "warning" : "ok"}
          fill={ratio(data.summary.review_needed_vm_count, data.summary.vm_count)}
        />
        <Metric
          icon={<TimerReset aria-hidden="true" />}
          label="Renewals"
          value={data.summary.license_count}
          detail={`${data.summary.renewal_review_count} pending`}
          tone={data.summary.renewal_review_count > 0 ? "warning" : "ok"}
          fill={ratio(data.summary.renewal_review_count, data.summary.license_count)}
        />
        <Metric
          icon={<KeyRound aria-hidden="true" />}
          label="Permissions"
          value={data.summary.permission_count}
          detail={`${data.summary.high_risk_permission_count} high risk`}
          tone={data.summary.high_risk_permission_count > 0 ? "risk" : "ok"}
          fill={ratio(data.summary.high_risk_permission_count, data.summary.permission_count)}
        />
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
      </section>

      <section className="content-grid">
        <InventoryTable
          title="Services"
          icon={<Activity aria-hidden="true" />}
          columns={["Name", "Type", "Owner", "Status", "Monitoring"]}
          rows={data.services.map((service) => ({
            id: service.id,
            tone: service.status === "healthy" ? "ok" : "warning",
            cells: [
              service.name,
              service.service_type,
              service.owner_team,
              service.status,
              service.monitoring_status,
            ],
          }))}
        />
        <InventoryTable
          title="VM Ownership"
          icon={<Server aria-hidden="true" />}
          columns={["Name", "Team", "Environment", "Patch", "Review"]}
          rows={data.vms.map((vm) => ({
            id: vm.id,
            tone: vm.review_status === "active" ? "ok" : "warning",
            cells: [vm.name, vm.team, vm.environment, vm.patch_status, vm.review_status],
          }))}
        />
        <InventoryTable
          title="Expiry Center"
          icon={<TimerReset aria-hidden="true" />}
          columns={["Name", "Owner", "Expires", "Status"]}
          rows={data.licenses.map((license) => ({
            id: license.id,
            tone: license.renewal_status === "active" ? "ok" : "warning",
            cells: [
              license.name,
              license.owner_team,
              license.expires_on,
              license.renewal_status,
            ],
          }))}
        />
        <InventoryTable
          title="Permission Watch"
          icon={<ShieldAlert aria-hidden="true" />}
          columns={["Principal", "System", "Role", "Risk"]}
          rows={data.permissions.map((permission) => ({
            id: permission.id,
            tone: permission.risk_level === "high" ? "risk" : "ok",
            cells: [
              permission.principal,
              permission.system,
              permission.role,
              permission.risk_level,
            ],
          }))}
        />
        <InventoryTable
          title="Agent Activity"
          icon={<Bot aria-hidden="true" />}
          columns={["Session", "Target", "Status", "Approval"]}
          rows={data.agentSessions.map((session) => ({
            id: session.id,
            tone: session.status === "completed" ? "ok" : "warning",
            cells: [
              session.id,
              session.target,
              session.status,
              session.approval_required ? "required" : "not required",
            ],
          }))}
        />
      </section>
    </DashboardFrame>
  );
}

function DashboardFrame({ children }: { children: ReactNode }) {
  return (
    <div className="workspace-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <ShellNav />
      <main className="app-shell" id="main-content">
        {children}
      </main>
    </div>
  );
}

function ShellNav() {
  return (
    <aside className="side-nav" aria-label="Primary">
      <div className="brand-mark" aria-hidden="true">
        SD
      </div>
      <nav>
        <a className="nav-item active" href="#main-content" aria-current="page">
          <LayoutDashboard aria-hidden="true" />
          Overview
        </a>
        <a className="nav-item" href="#services">
          <Activity aria-hidden="true" />
          Services
        </a>
        <a className="nav-item" href="#vm-ownership">
          <Server aria-hidden="true" />
          VMs
        </a>
        <a className="nav-item" href="#agent-activity">
          <Bot aria-hidden="true" />
          Agents
        </a>
      </nav>
    </aside>
  );
}

function TopBar({
  updatedAt,
  refreshing,
  onRefresh,
}: {
  updatedAt: string;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <header className="top-bar">
      <div>
        <p className="eyebrow">DevOps Control Center</p>
        <h1>Spaghetti Desk</h1>
        <p className="status-line">Demo inventory loaded {updatedAt}</p>
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
  tone: "ok" | "warning" | "risk";
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

type TableRow = {
  id: string;
  cells: string[];
  tone?: "ok" | "warning" | "risk";
};

const InventoryTable = memo(function InventoryTable({
  title,
  icon,
  columns,
  rows,
}: {
  title: string;
  icon: ReactNode;
  columns: string[];
  rows: TableRow[];
}) {
  const id = title.toLowerCase().replace(/\s+/g, "-");

  return (
    <section className="table-panel" id={id}>
      <div className="panel-heading">
        <span>{icon}</span>
        <h2>{title}</h2>
      </div>
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
            {rows.map((row) => (
              <tr key={row.id} className={row.tone ? `row-${row.tone}` : undefined}>
                {row.cells.map((cell, index) => (
                  <td key={`${row.id}-${columns[index]}`}>
                    {index === row.cells.length - 1 ? (
                      <span className={`status-pill ${row.tone ?? "ok"}`}>{cell}</span>
                    ) : (
                      cell
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
});

function LoadingDashboard() {
  return (
    <DashboardFrame>
      <header className="top-bar">
        <div>
          <p className="eyebrow">DevOps Control Center</p>
          <h1>Spaghetti Desk</h1>
          <p className="status-line">Loading local inventory state</p>
        </div>
        <div className="icon-button skeleton-button" aria-hidden="true" />
      </header>

      <section className="summary-grid" aria-label="Loading summary">
        {Array.from({ length: 5 }, (_, index) => (
          <article className="metric skeleton-card" key={index} aria-hidden="true" />
        ))}
      </section>

      <section className="content-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <section className="table-panel skeleton-table" key={index} aria-hidden="true" />
        ))}
      </section>
    </DashboardFrame>
  );
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
