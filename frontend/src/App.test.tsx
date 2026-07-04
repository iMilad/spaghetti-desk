import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Dashboard } from "./App";
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
  agentSessions: [],
  permissions: [],
};

describe("Dashboard", () => {
  it("renders operational summary and inventory sections", () => {
    render(<Dashboard data={data} />);

    expect(screen.getByText("Spaghetti Desk")).toBeInTheDocument();
    expect(screen.getByText("Continuous Integration")).toBeInTheDocument();
    expect(screen.getByText("demo-build-01")).toBeInTheDocument();
    expect(screen.getByText("Code Quality Platform")).toBeInTheDocument();
  });
});

