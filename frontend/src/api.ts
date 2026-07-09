import type {
  AgentSession,
  ActionLog,
  AppBootstrap,
  CollectorRun,
  CollectorStatusResponse,
  CurrentOperator,
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

const apiBase = resolveApiBase(import.meta.env.VITE_API_BASE_URL);
let bootstrapRequestId = 0;
const bootstrapPayloadKey = "__spaghettiDeskBootstrapPayload";

export function resolveApiBase(configuredApiBase: string | undefined): string {
  if (configuredApiBase !== undefined) {
    return trimTrailingSlashes(configuredApiBase.trim());
  }

  return "";
}

export function buildApiUrl(path: string, base = apiBase): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

async function getJson<T>(path: string): Promise<T> {
  return requestJson<T>("GET", path);
}

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  return requestJson<T>("POST", path, payload);
}

async function requestJson<T>(
  method: "GET" | "POST",
  path: string,
  payload?: unknown,
): Promise<T> {
  try {
    return await requestJsonWithFetch<T>(method, path, payload);
  } catch {
    try {
      return await requestJsonWithXhr<T>(method, path, payload);
    } catch {
      throw new Error(
        `Unable to reach inventory API for ${path}. Check that the backend is running.`,
      );
    }
  }
}

async function requestJsonWithFetch<T>(
  method: "GET" | "POST",
  path: string,
  payload?: unknown,
): Promise<T> {
  const fetchImpl = globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is unavailable");
  }

  const response = await fetchImpl(buildApiUrl(path), {
    method,
    headers: payload === undefined
      ? { Accept: "application/json" }
      : {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Request failed for ${path}: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

function requestJsonWithXhr<T>(
  method: "GET" | "POST",
  path: string,
  payload?: unknown,
): Promise<T> {
  if (typeof XMLHttpRequest !== "function") {
    return Promise.reject(new Error("XMLHttpRequest is unavailable"));
  }

  return new Promise<T>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(method, buildApiUrl(path), true);
    request.setRequestHeader("Accept", "application/json");
    if (payload !== undefined) {
      request.setRequestHeader("Content-Type", "application/json");
    }

    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(`Request failed for ${path}: ${request.status} ${request.statusText}`));
        return;
      }

      try {
        resolve(JSON.parse(request.responseText) as T);
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Invalid JSON response"));
      }
    };
    request.onerror = () => reject(new Error(`Network error for ${path}`));
    request.ontimeout = () => reject(new Error(`Request timed out for ${path}`));
    request.send(payload === undefined ? undefined : JSON.stringify(payload));
  });
}

function hasStandardRequestTransport(): boolean {
  return typeof globalThis.fetch === "function" || typeof XMLHttpRequest === "function";
}

function readBootstrapPayload(): AppBootstrap | null {
  const globals = globalThis as typeof globalThis & Record<string, unknown>;
  const payload = globals[bootstrapPayloadKey];
  return payload && typeof payload === "object" ? (payload as AppBootstrap) : null;
}

function loadBootstrapScript(): Promise<AppBootstrap> {
  const cachedPayload = readBootstrapPayload();
  if (cachedPayload) {
    return Promise.resolve(cachedPayload);
  }

  if (typeof document === "undefined") {
    return Promise.reject(new Error("Script bootstrap is unavailable outside the browser."));
  }

  return new Promise<AppBootstrap>((resolve, reject) => {
    const callbackName = `spaghettiDeskBootstrap${Date.now()}_${bootstrapRequestId++}`;
    const globalCallbacks = globalThis as typeof globalThis & Record<string, unknown>;
    const script = document.createElement("script");
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (timeout !== undefined) {
        globalThis.clearTimeout(timeout);
      }
      delete globalCallbacks[callbackName];
      script.remove();
    };

    globalCallbacks[callbackName] = (payload: AppBootstrap) => {
      cleanup();
      resolve(payload);
    };
    script.async = true;
    script.src = buildApiUrl(
      `/api/v1/bootstrap.js?callback=${encodeURIComponent(callbackName)}`,
    );
    script.onerror = () => {
      cleanup();
      reject(new Error("Script bootstrap failed."));
    };
    timeout = globalThis.setTimeout(() => {
      cleanup();
      reject(new Error("Script bootstrap timed out."));
    }, 10_000);
    document.head.appendChild(script);
  });
}

async function getOptionalJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return await getJson<T>(path);
  } catch {
    return fallback;
  }
}

export async function fetchDashboard(): Promise<DashboardData> {
  if (!hasStandardRequestTransport()) {
    return (await loadBootstrapScript()).dashboard;
  }

  try {
    return await fetchDashboardWithRequests();
  } catch {
    return (await loadBootstrapScript()).dashboard;
  }
}

async function fetchDashboardWithRequests(): Promise<DashboardData> {
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
    summary: withActionSummaryCounts(summary, actionLogs.items),
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

export type ActionRequestDecisionPayload = {
  reason?: string;
};

export async function approveActionRequest(
  actionId: string,
  payload: ActionRequestDecisionPayload,
): Promise<ActionLog> {
  return postJson<ActionLog>(
    `/api/v1/action-requests/${encodeURIComponent(actionId)}/approve`,
    payload,
  );
}

export async function rejectActionRequest(
  actionId: string,
  payload: ActionRequestDecisionPayload,
): Promise<ActionLog> {
  return postJson<ActionLog>(
    `/api/v1/action-requests/${encodeURIComponent(actionId)}/reject`,
    payload,
  );
}

export async function fetchAppConfig(): Promise<AppConfig> {
  if (!hasStandardRequestTransport()) {
    return normalizeAppConfig((await loadBootstrapScript()).appConfig);
  }

  try {
    return await fetchAppConfigWithRequests();
  } catch {
    return normalizeAppConfig((await loadBootstrapScript()).appConfig);
  }
}

async function fetchAppConfigWithRequests(): Promise<AppConfig> {
  return normalizeAppConfig(await getJson<AppConfig>("/api/v1/app-config"));
}

export async function fetchCurrentOperator(): Promise<CurrentOperator> {
  if (!hasStandardRequestTransport()) {
    return (await loadBootstrapScript()).operator;
  }

  try {
    return await fetchCurrentOperatorWithRequests();
  } catch {
    return (await loadBootstrapScript()).operator;
  }
}

async function fetchCurrentOperatorWithRequests(): Promise<CurrentOperator> {
  return getJson<CurrentOperator>("/api/v1/operator");
}

export async function fetchInitialAppData(): Promise<{
  appConfig: AppConfig;
  dashboard: DashboardData;
  operator: CurrentOperator;
}> {
  const bootstrapPayload = readBootstrapPayload();
  if (bootstrapPayload) {
    return {
      ...bootstrapPayload,
      appConfig: normalizeAppConfig(bootstrapPayload.appConfig),
    };
  }

  if (!hasStandardRequestTransport()) {
    const bootstrap = await loadBootstrapScript();
    return {
      ...bootstrap,
      appConfig: normalizeAppConfig(bootstrap.appConfig),
    };
  }

  try {
    const [appConfig, dashboard, operator] = await Promise.all([
      fetchAppConfigWithRequests(),
      fetchDashboardWithRequests(),
      fetchCurrentOperatorWithRequests(),
    ]);
    return { appConfig, dashboard, operator };
  } catch {
    const bootstrap = await loadBootstrapScript();
    return {
      ...bootstrap,
      appConfig: normalizeAppConfig(bootstrap.appConfig),
    };
  }
}

export function withActionSummaryCounts(
  summary: InventorySummary,
  actionLogs: ActionLog[],
): InventorySummary {
  return {
    ...summary,
    action_log_count: actionLogs.length,
    pending_approval_count: actionLogs.filter((action) => action.approval_status === "pending")
      .length,
    failed_action_count: actionLogs.filter((action) => action.execution_status === "failed")
      .length,
  };
}
