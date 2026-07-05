export type Page<T> = {
  meta: {
    total: number;
    limit: number;
    offset: number;
  };
  items: T[];
};

export type InventorySummary = {
  service_count: number;
  degraded_service_count: number;
  vm_count: number;
  unknown_owner_vm_count: number;
  review_needed_vm_count: number;
  license_count: number;
  renewal_review_count: number;
  permission_count: number;
  high_risk_permission_count: number;
  agent_session_count: number;
  agent_sessions_needing_review: number;
  loaded_at: string;
};

export type Service = {
  id: string;
  name: string;
  service_type: string;
  status: string;
  owner_team: string;
  lifecycle: string;
  version: string;
  example_url: string;
  host_id: string;
  license_id: string | null;
  backup_status: string;
  monitoring_status: string;
  last_maintenance: string;
  documentation_url: string;
  known_risks: string[];
};

export type VM = {
  id: string;
  name: string;
  ip_address: string;
  owner: string;
  team: string;
  purpose: string;
  environment: string;
  tags: string[];
  cpu: number;
  ram_gb: number;
  disk_gb: number;
  os: string;
  created_on: string;
  last_seen_at: string;
  patch_status: string;
  ownership_confidence: string;
  review_status: string;
};

export type License = {
  id: string;
  name: string;
  vendor: string;
  category: string;
  owner_team: string;
  expires_on: string;
  renewal_status: string;
  risk: string;
};

export type Permission = {
  id: string;
  principal: string;
  system: string;
  role: string;
  risk_level: string;
  last_seen_at: string;
};

export type AgentSession = {
  id: string;
  operator: string;
  target: string;
  task_summary: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  files_changed: string[];
  commands_run: string[];
  approval_required: boolean;
  outcome: string;
};

export type CollectorStatus = {
  name: string;
  installed: boolean;
  enabled: boolean;
  interval_seconds: number | null;
};

export type CollectorStatusResponse = {
  collectors: CollectorStatus[];
};

export type DashboardData = {
  summary: InventorySummary;
  services: Service[];
  vms: VM[];
  licenses: License[];
  permissions: Permission[];
  agentSessions: AgentSession[];
  collectors: CollectorStatus[];
};
