import type {
  AgentSession,
  ActionLog,
  CollectorRun,
  CollectorStatusResponse,
  DashboardData,
  InventorySummary,
  License,
  Page,
  Permission,
  Pipeline,
  Service,
  VM,
} from "./types";
import { normalizeAppConfig } from "./moduleConfig";
import type { AppConfig } from "./moduleConfig";

const localBackendApiBase = "http://127.0.0.1:8000";
const currentHostname = typeof window === "undefined" ? "" : window.location.hostname;
const apiBase = resolveApiBase(import.meta.env.VITE_API_BASE_URL, currentHostname);

export function resolveApiBase(configuredApiBase: string | undefined, hostname: string): string {
  if (configuredApiBase !== undefined) {
    return trimTrailingSlashes(configuredApiBase.trim());
  }

  return isLocalHost(hostname) ? localBackendApiBase : "";
}

export function buildApiUrl(path: string, base = apiBase): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function isLocalHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

async function getJson<T>(path: string): Promise<T> {
  let response: Response;

  try {
    response = await fetch(buildApiUrl(path), {
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new Error(
      `Unable to reach inventory API for ${path}. Check that the backend is running.`,
    );
  }

  if (!response.ok) {
    throw new Error(`Request failed for ${path}: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

async function getOptionalJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return await getJson<T>(path);
  } catch {
    return fallback;
  }
}

export async function fetchDashboard(): Promise<DashboardData> {
  const emptyCollectorRuns: Page<CollectorRun> = {
    meta: { total: 0, limit: 20, offset: 0 },
    items: [],
  };
  const emptyPipelines: Page<Pipeline> = {
    meta: { total: 0, limit: 20, offset: 0 },
    items: [],
  };
  const [
    summary,
    services,
    pipelines,
    vms,
    licenses,
    agentSessions,
    actionLogs,
    permissions,
    collectors,
    collectorRuns,
  ] = await Promise.all([
    getJson<InventorySummary>("/api/v1/summary"),
    getJson<Page<Service>>("/api/v1/services?limit=10"),
    getOptionalJson<Page<Pipeline>>("/api/v1/pipelines?limit=20", emptyPipelines),
    getJson<Page<VM>>("/api/v1/vms?limit=10"),
    getJson<Page<License>>("/api/v1/licenses?limit=10"),
    getJson<Page<AgentSession>>("/api/v1/agent-sessions?limit=10"),
    getJson<Page<ActionLog>>("/api/v1/action-logs?limit=20"),
    getJson<Page<Permission>>("/api/v1/permissions?limit=10"),
    getJson<CollectorStatusResponse>("/api/v1/collectors"),
    getOptionalJson<Page<CollectorRun>>("/api/v1/collector-runs?limit=20", emptyCollectorRuns),
  ]);

  return {
    summary,
    services: services.items,
    pipelines: pipelines.items,
    vms: vms.items,
    licenses: licenses.items,
    agentSessions: agentSessions.items,
    actionLogs: actionLogs.items,
    permissions: permissions.items,
    collectors: collectors.collectors,
    collectorRuns: collectorRuns.items,
  };
}

export async function fetchAppConfig(): Promise<AppConfig> {
  return normalizeAppConfig(await getJson<AppConfig>("/api/v1/app-config"));
}

export async function fetchInitialAppData(): Promise<{
  appConfig: AppConfig;
  dashboard: DashboardData;
}> {
  const [appConfig, dashboard] = await Promise.all([fetchAppConfig(), fetchDashboard()]);
  return { appConfig, dashboard };
}
