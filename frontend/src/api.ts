import type {
  AgentSession,
  DashboardData,
  InventorySummary,
  License,
  Page,
  Permission,
  Service,
  VM,
} from "./types";

const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export async function fetchDashboard(): Promise<DashboardData> {
  const [summary, services, vms, licenses, agentSessions, permissions] = await Promise.all([
    getJson<InventorySummary>("/api/v1/summary"),
    getJson<Page<Service>>("/api/v1/services?limit=10"),
    getJson<Page<VM>>("/api/v1/vms?limit=10"),
    getJson<Page<License>>("/api/v1/licenses?limit=10"),
    getJson<Page<AgentSession>>("/api/v1/agent-sessions?limit=10"),
    getJson<Page<Permission>>("/api/v1/permissions?limit=10"),
  ]);

  return {
    summary,
    services: services.items,
    vms: vms.items,
    licenses: licenses.items,
    agentSessions: agentSessions.items,
    permissions: permissions.items,
  };
}

