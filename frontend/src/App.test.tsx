import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { Dashboard } from "./App";
import { defaultAppConfig } from "./moduleConfig";
import type { DashboardData } from "./types";

const data: DashboardData = {
  summary: {
    service_count: 4,
    degraded_service_count: 1,
    vm_count: 6,
    unknown_owner_vm_count: 1,
    review_needed_vm_count: 2,
    license_count: 3,
    renewal_review_count: 1,
    permission_count: 4,
    high_risk_permission_count: 1,
    agent_session_count: 2,
    agent_sessions_needing_review: 1,
    loaded_at: "2026-07-04T00:00:00Z",
  },
  services: [
    {
      id: "service-demo-ci",
      name: "Continuous Integration",
      service_type: "ci",
      status: "degraded",
      owner_team: "Platform Operations",
      lifecycle: "production",
      version: "demo-2.492",
      example_url: "https://ci.example.invalid",
      host_id: "vm-demo-ci-01",
      license_id: null,
      backup_status: "verified",
      monitoring_status: "partial",
      last_maintenance: "2026-06-15",
      documentation_url: "https://docs.example.invalid/services/ci",
      known_risks: ["One demo worker has unknown ownership."],
    },
  ],
  vms: [
    {
      id: "vm-demo-build-01",
      name: "demo-build-01",
      ip_address: "198.51.100.31",
      owner: "Unknown",
      team: "Unknown",
      purpose: "Legacy demo build worker.",
      environment: "development",
      tags: ["ci", "worker"],
      cpu: 4,
      ram_gb: 8,
      disk_gb: 120,
      os: "Ubuntu 22.04 LTS",
      created_on: "2025-11-05",
      last_seen_at: "2026-06-10T07:30:00Z",
      patch_status: "unknown",
      ownership_confidence: "unknown",
      review_status: "stale",
    },
  ],
  licenses: [
    {
      id: "license-demo-code-quality",
      name: "Code Quality Platform",
      vendor: "Example Vendor",
      category: "product-license",
      owner_team: "Platform Operations",
      expires_on: "2027-01-15",
      renewal_status: "review_needed",
      risk: "Renewal owner is assigned but budget approval is pending.",
    },
  ],
  agentSessions: [
    {
      id: "session-demo-001",
      operator: "demo-operator",
      target: "vm-demo-build-01",
      task_summary: "Investigated stale build worker ownership using demo inventory.",
      status: "completed",
      started_at: "2026-07-01T09:00:00Z",
      ended_at: "2026-07-01T09:18:00Z",
      files_changed: ["examples/demo-data/vms.json"],
      commands_run: ["pytest"],
      approval_required: false,
      outcome: "Marked ownership confidence as guessed for review.",
    },
  ],
  permissions: [
    {
      id: "permission-demo-001",
      principal: "platform-admin@example.invalid",
      system: "demo-ci",
      role: "admin",
      risk_level: "high",
      last_seen_at: "2026-07-01T08:00:00Z",
    },
  ],
};

describe("Dashboard", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("renders operational summary and inventory sections", () => {
    render(<Dashboard data={data} />);

    expect(screen.getAllByText("Spaghetti Desk").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { level: 1, name: "Overview" })).toBeInTheDocument();
    expect(screen.getByText("Continuous Integration")).toBeInTheDocument();
    expect(screen.getByText("demo-build-01")).toBeInTheDocument();
    expect(screen.getByText("Code Quality Platform")).toBeInTheDocument();
  });

  it("switches screenshot navigation items as in-app pages", () => {
    render(<Dashboard data={data} />);

    fireEvent.click(screen.getByRole("button", { name: "Services" }));
    expect(screen.getByRole("heading", { level: 1, name: "Services" })).toBeInTheDocument();
    expect(screen.getByText("Service inventory")).toBeInTheDocument();
    expect(window.location.hash).toBe("#services");

    fireEvent.click(screen.getByRole("button", { name: "VMs" }));
    expect(screen.getByRole("heading", { level: 1, name: "VMs" })).toBeInTheDocument();
    expect(screen.getByText("VM ownership")).toBeInTheDocument();
    expect(window.location.hash).toBe("#vms");

    fireEvent.click(screen.getByRole("button", { name: "Licenses" }));
    expect(screen.getByRole("heading", { level: 1, name: "Licenses" })).toBeInTheDocument();
    expect(screen.getByText("License renewals")).toBeInTheDocument();
    expect(window.location.hash).toBe("#licenses");

    fireEvent.click(screen.getByRole("button", { name: "Permissions" }));
    expect(screen.getByRole("heading", { level: 1, name: "Permissions" })).toBeInTheDocument();
    expect(screen.getByText("Permission inventory")).toBeInTheDocument();
    expect(window.location.hash).toBe("#permissions");

    fireEvent.click(screen.getByRole("button", { name: "Agents" }));
    expect(screen.getByRole("heading", { level: 1, name: "Agents" })).toBeInTheDocument();
    expect(screen.getByText("Agent sessions")).toBeInTheDocument();
    expect(window.location.hash).toBe("#agents");

    fireEvent.click(screen.getByRole("button", { name: "Overview" }));
    expect(screen.getByRole("heading", { level: 1, name: "Overview" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#overview");
  });

  it("allows overview widgets to be configured from enabled modules", () => {
    render(<Dashboard data={data} />);

    fireEvent.click(screen.getByRole("button", { name: "Customize overview" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Services snapshot/i }));

    expect(screen.queryByText("Continuous Integration")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /Permission risk/i }));
    expect(screen.getByText("platform-admin@example.invalid")).toBeInTheDocument();
  });

  it("uses runtime config to remove disabled modules from navigation and overview", () => {
    const appConfig = {
      ...defaultAppConfig,
      modules: {
        ...defaultAppConfig.modules,
        vms: {
          ...defaultAppConfig.modules.vms,
          enabled: false,
        },
      },
    };

    window.history.replaceState(null, "", "/#vms");
    render(<Dashboard appConfig={appConfig} data={data} />);

    expect(screen.queryByRole("button", { name: "VMs" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Overview" })).toBeInTheDocument();
    expect(screen.queryByText("demo-build-01")).not.toBeInTheDocument();
  });

  it("uses the runtime config storage key for overview widget overrides", () => {
    const appConfig = {
      ...defaultAppConfig,
      preferences: {
        overviewWidgetStorageKey: "spaghetti-desk.test-overview-widgets",
      },
    };
    window.localStorage.setItem(
      "spaghetti-desk.test-overview-widgets",
      JSON.stringify(["permission-risk"]),
    );

    render(<Dashboard appConfig={appConfig} data={data} />);

    expect(screen.getByText("platform-admin@example.invalid")).toBeInTheDocument();
  });
});
