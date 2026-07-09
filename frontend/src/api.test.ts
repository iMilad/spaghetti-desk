import { describe, expect, it } from "vitest";

import { buildApiUrl, resolveApiBase, withActionSummaryCounts } from "./api";
import type { ActionLog, InventorySummary } from "./types";

describe("api helpers", () => {
  it("uses the configured API base when one is provided", () => {
    expect(resolveApiBase("http://api.example.invalid/")).toBe("http://api.example.invalid");
  });

  it("defaults browser sessions to same-origin API requests", () => {
    expect(resolveApiBase(undefined)).toBe("");
  });

  it("builds API URLs without duplicate slashes", () => {
    expect(buildApiUrl("/api/v1/summary", "http://127.0.0.1:8000")).toBe(
      "http://127.0.0.1:8000/api/v1/summary",
    );
    expect(buildApiUrl("api/v1/summary", "")).toBe("/api/v1/summary");
  });

  it("derives action counts from the fetched local action log list", () => {
    const summary: InventorySummary = {
      service_count: 0,
      degraded_service_count: 0,
      vm_count: 0,
      unknown_owner_vm_count: 0,
      review_needed_vm_count: 0,
      license_count: 0,
      renewal_review_count: 0,
      permission_count: 0,
      high_risk_permission_count: 0,
      agent_session_count: 0,
      agent_sessions_needing_review: 0,
      action_log_count: 0,
      pending_approval_count: 0,
      failed_action_count: 0,
      loaded_at: "2026-07-04T00:00:00Z",
    };
    const actionLogs: ActionLog[] = [
      actionLog("action-local-001", "pending", "blocked"),
      actionLog("action-local-002", "approved", "not_started"),
      actionLog("action-local-003", "not_required", "failed"),
    ];

    expect(withActionSummaryCounts(summary, actionLogs)).toMatchObject({
      action_log_count: 3,
      pending_approval_count: 1,
      failed_action_count: 1,
    });
  });
});

function actionLog(
  id: string,
  approvalStatus: string,
  executionStatus: string,
): ActionLog {
  return {
    id,
    action_type: "vm.review.request",
    target_system: "spaghetti-desk",
    target_type: "vm",
    target_id: "vm-demo-build-01",
    requested_by: "demo-operator",
    requested_at: "2026-07-04T00:00:00Z",
    approval_status: approvalStatus,
    approved_by: null,
    approved_at: null,
    execution_status: executionStatus,
    started_at: null,
    finished_at: null,
    duration_ms: null,
    risk_level: "medium",
    summary: "Request owner review for stale demo build worker.",
    sanitized_parameters: {},
    before_state: {},
    after_state: {},
    result_summary: "Recorded only.",
    evidence_links: [],
  };
}
