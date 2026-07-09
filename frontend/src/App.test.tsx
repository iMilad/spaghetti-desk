import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    action_log_count: 3,
    pending_approval_count: 1,
    failed_action_count: 1,
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
  actionLogs: [
    {
      id: "action-demo-001",
      action_type: "vm.review.request",
      target_system: "spaghetti-desk",
      target_type: "vm",
      target_id: "vm-demo-build-01",
      requested_by: "demo-operator",
      requested_at: "2026-07-02T14:05:00Z",
      approval_status: "pending",
      approved_by: null,
      approved_at: null,
      execution_status: "queued",
      started_at: null,
      finished_at: null,
      duration_ms: null,
      risk_level: "medium",
      summary: "Request owner review for stale demo build worker.",
      sanitized_parameters: { review_reason: "stale_owner" },
      before_state: { review_status: "stale" },
      after_state: {},
      result_summary: "Waiting for approval before any external notification is sent.",
      evidence_links: ["https://docs.example.invalid/runbooks/vm-review"],
    },
    {
      id: "action-demo-003",
      action_type: "permission.review.sync",
      target_system: "demo-ci",
      target_type: "permission",
      target_id: "permission-demo-001",
      requested_by: "demo-agent",
      requested_at: "2026-07-01T08:25:00Z",
      approval_status: "not_required",
      approved_by: null,
      approved_at: null,
      execution_status: "failed",
      started_at: "2026-07-01T08:26:00Z",
      finished_at: "2026-07-01T08:26:02Z",
      duration_ms: 2000,
      risk_level: "high",
      summary: "Refresh demo permission evidence for high-risk admin access.",
      sanitized_parameters: { principal: "platform-admin@example.invalid", mode: "dry-run" },
      before_state: { risk_level: "high" },
      after_state: {},
      result_summary: "Dry-run failed because no real collector is configured in public demo mode.",
      evidence_links: [],
    },
  ],
  pipelines: [
    {
      id: "jenkins:demo-pipeline",
      provider: "jenkins",
      source_id: "demo-pipeline",
      name: "Demo Pipeline",
      source_url: "https://jenkins.example.invalid/job/demo-pipeline",
      owner_team: "Platform Operations",
      status: "failed",
      last_run_status: "failure",
      last_run_at: "2026-07-03T10:00:00Z",
      last_duration_ms: 92_000,
      metadata: { jenkins_color: "red" },
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
  collectors: [
    {
      name: "jenkins",
      installed: false,
      enabled: false,
      configured: false,
      interval_seconds: null,
      last_run: {
        id: "run-demo:jenkins",
        run_id: "run-demo",
        collector_name: "jenkins",
        status: "skipped",
        dry_run: true,
        started_at: "2026-07-04T00:00:00Z",
        finished_at: "2026-07-04T00:00:01Z",
        duration_ms: 12,
        records_seen: 0,
        records_changed: 0,
        message: "Jenkins base_url is not configured.",
        metadata: { provider: "jenkins" },
      },
    },
  ],
  collectorRuns: [
    {
      id: "run-demo:jenkins",
      run_id: "run-demo",
      collector_name: "jenkins",
      status: "skipped",
      dry_run: true,
      started_at: "2026-07-04T00:00:00Z",
      finished_at: "2026-07-04T00:00:01Z",
      duration_ms: 12,
      records_seen: 0,
      records_changed: 0,
      message: "Jenkins base_url is not configured.",
      metadata: { provider: "jenkins" },
    },
  ],
};

describe("Dashboard", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");
    document.documentElement.removeAttribute("data-theme");
  });

  it("renders the shell and the overview triage dashboard", () => {
    render(<Dashboard data={data} />);

    expect(screen.getAllByText("Spaghetti Desk").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { level: 1, name: "Overview" })).toBeInTheDocument();

    // KPI strip: one tile per enabled module.
    expect(screen.getByText("Services healthy")).toBeInTheDocument();
    expect(screen.getByText("Pipelines healthy")).toBeInTheDocument();
    expect(screen.getByText("VMs needing review")).toBeInTheDocument();
    expect(screen.getByText("Permission findings")).toBeInTheDocument();
    expect(screen.getByText("Pending approvals")).toBeInTheDocument();

    // Needs-attention triage feed merges the worst items across modules.
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(screen.getByText("Continuous Integration degraded")).toBeInTheDocument();
    expect(screen.getByText("Demo Pipeline failed")).toBeInTheDocument();
    expect(screen.getByText("demo-build-01 — unreviewed")).toBeInTheDocument();
    expect(screen.getByText("permission.review.sync on permission-demo-001")).toBeInTheDocument();
  });

  it("navigates between module screens as in-app pages", () => {
    render(<Dashboard data={data} />);

    fireEvent.click(screen.getByRole("button", { name: /^Services$/ }));
    expect(screen.getByRole("heading", { level: 1, name: "Services" })).toBeInTheDocument();
    expect(screen.getByText("Continuous Integration")).toBeInTheDocument();
    expect(window.location.hash).toBe("#services");

    fireEvent.click(screen.getByRole("button", { name: /Pipelines/ }));
    expect(screen.getByRole("heading", { level: 1, name: "Pipelines" })).toBeInTheDocument();
    expect(screen.getByText("Demo Pipeline")).toBeInTheDocument();
    expect(screen.getByText("1 m 32 s")).toBeInTheDocument();
    expect(window.location.hash).toBe("#pipelines");

    fireEvent.click(screen.getByRole("button", { name: /Virtual machines/ }));
    expect(
      screen.getByRole("heading", { level: 1, name: "Virtual machines" }),
    ).toBeInTheDocument();
    expect(screen.getByText("demo-build-01")).toBeInTheDocument();
    expect(window.location.hash).toBe("#vms");

    fireEvent.click(screen.getByRole("button", { name: /Licenses/ }));
    expect(screen.getByRole("heading", { level: 1, name: "Licenses" })).toBeInTheDocument();
    expect(screen.getByText("Code Quality Platform")).toBeInTheDocument();
    expect(window.location.hash).toBe("#licenses");

    fireEvent.click(screen.getByRole("button", { name: /Permissions/ }));
    expect(screen.getByRole("heading", { level: 1, name: "Permissions" })).toBeInTheDocument();
    expect(screen.getByText("platform-admin@example.invalid")).toBeInTheDocument();
    expect(window.location.hash).toBe("#permissions");

    fireEvent.click(screen.getByRole("button", { name: /Agent sessions/ }));
    expect(
      screen.getByRole("heading", { level: 1, name: "Agent sessions" }),
    ).toBeInTheDocument();
    expect(screen.getByText("session-demo-001")).toBeInTheDocument();
    expect(window.location.hash).toBe("#agents");

    fireEvent.click(screen.getByRole("button", { name: /Actions & audit/ }));
    expect(
      screen.getByRole("heading", { level: 1, name: "Actions & audit" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("vm.review.request").length).toBeGreaterThan(0);
    expect(screen.getByText("permission.review.sync")).toBeInTheDocument();
    expect(window.location.hash).toBe("#audit");

    fireEvent.click(screen.getByRole("button", { name: /Collectors/ }));
    expect(screen.getByRole("region", { name: "Collectors" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Plugin registry" })).toBeInTheDocument();
    expect(screen.getByText("collector-jenkins")).toBeInTheDocument();
    expect(screen.getAllByText("No").length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText("Skipped").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Recent run history")).toBeInTheDocument();
    expect(screen.getByText("Jenkins base_url is not configured.")).toBeInTheDocument();
    expect(window.location.hash).toBe("#collectors");

    fireEvent.click(screen.getByRole("button", { name: "Overview" }));
    expect(screen.getByRole("heading", { level: 1, name: "Overview" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#overview");
  });

  it("filters table rows and shows an empty state", () => {
    render(<Dashboard data={data} />);

    fireEvent.click(screen.getByRole("button", { name: /^Services$/ }));
    const search = screen.getByRole("searchbox", { name: "Filter Services" });

    fireEvent.change(search, { target: { value: "missing-service" } });
    expect(screen.getByText("No matching rows")).toBeInTheDocument();
    expect(screen.queryByText("Continuous Integration")).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "continuous" } });
    expect(screen.getByText("Continuous Integration")).toBeInTheDocument();
  });

  it("opens a row detail panel on selection", () => {
    render(<Dashboard data={data} />);

    fireEvent.click(screen.getByRole("button", { name: /^Services$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Open Continuous Integration" }));

    const panel = screen.getByRole("complementary", {
      name: "Continuous Integration detail",
    });
    expect(panel).toBeInTheDocument();
    expect(screen.getByText("One demo worker has unknown ownership.")).toBeInTheDocument();
  });

  it("shows pending action requests and calls the approval handler", async () => {
    const livePendingData: DashboardData = {
      ...data,
      actionLogs: [
        {
          ...data.actionLogs[0],
          id: "action-20260709105918-7ad7528b",
        },
        data.actionLogs[1],
      ],
    };
    const onDecideActionRequest = vi
      .fn()
      .mockResolvedValue({ ...livePendingData.actionLogs[0], approval_status: "approved" });

    render(
      <Dashboard
        data={livePendingData}
        onDecideActionRequest={onDecideActionRequest}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Actions & audit/ }));

    expect(
      screen.getByRole("region", { name: "Pending action requests" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Pending action requests")).toBeInTheDocument();
    expect(screen.getAllByText("vm.review.request").length).toBeGreaterThan(0);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Approve vm.review.request on vm-demo-build-01",
      }),
    );

    await waitFor(() =>
      expect(onDecideActionRequest).toHaveBeenCalledWith(
        "action-20260709105918-7ad7528b",
        "approve",
      ),
    );
  });

  it("removes navigation and KPIs for disabled modules", () => {
    const appConfig = {
      ...defaultAppConfig,
      modules: {
        ...defaultAppConfig.modules,
        vms: { ...defaultAppConfig.modules.vms, enabled: false },
      },
    };

    window.history.replaceState(null, "", "/#vms");
    render(<Dashboard appConfig={appConfig} data={data} />);

    expect(screen.queryByRole("button", { name: /Virtual machines/ })).not.toBeInTheDocument();
    expect(screen.queryByText("VMs needing review")).not.toBeInTheDocument();
    // A disabled module's hash falls back to the overview.
    expect(screen.getByRole("heading", { level: 1, name: "Overview" })).toBeInTheDocument();
  });

  it("toggles the color theme and persists it", () => {
    render(<Dashboard data={data} />);

    expect(document.documentElement.getAttribute("data-theme")).not.toBe("dark");
    fireEvent.click(screen.getByRole("button", { name: "Switch to dark theme" }));

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(window.localStorage.getItem("spaghetti-desk.theme")).toBe("dark");
    expect(screen.getByRole("button", { name: "Switch to light theme" })).toBeInTheDocument();
  });
});
