import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { defaultAppConfig } from "./moduleConfig";
import { SettingsPage } from "./settings";
import type { ManagedSettings } from "./types";

const api = vi.hoisted(() => ({
  fetchManagedSettings: vi.fn(),
  saveManagedSettings: vi.fn(),
  testJenkinsConnection: vi.fn(),
}));

vi.mock("./api", () => api);

const managedSettings: ManagedSettings = {
  operator: {
    id: "local-admin",
    display_name: "Local Administrator",
    role: "admin",
  },
  collectors_enabled: false,
  write_to_local_inventory: false,
  jenkins: {
    enabled: false,
    interval_seconds: 300,
    base_url: "https://jenkins.company.example",
    job_include_patterns: ["platform-*"],
    default_owner_team: "Platform",
    timeout_seconds: 10,
    verify_tls: true,
    username_configured: true,
    token_configured: true,
  },
  actions: {
    enabled: false,
    require_approval_by_default: true,
    audit_all_attempts: true,
  },
  storage: {
    writable: true,
    source: "user_configuration",
    message: "Settings are stored in the private user configuration.",
  },
};

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchManagedSettings.mockResolvedValue(managedSettings);
    api.saveManagedSettings.mockResolvedValue({
      settings: {
        ...managedSettings,
        operator: { ...managedSettings.operator, display_name: "Platform Administrator" },
      },
      message: "Settings saved and collectors reloaded.",
      collector_runtime_reloaded: true,
    });
    api.testJenkinsConnection.mockResolvedValue({
      success: true,
      message: "Connection successful. Jenkins returned 4 jobs.",
      records_seen: 4,
    });
  });

  it("loads managed configuration without revealing stored credentials", async () => {
    renderSettings();

    expect(await screen.findByDisplayValue("Local Administrator")).toBeInTheDocument();
    expect(screen.getByText("A username is already stored.")).toBeInTheDocument();
    expect(screen.getByText("A token is already stored.")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("private-token")).not.toBeInTheDocument();
    expect(screen.getByText("Private configuration is writable")).toBeInTheDocument();
  });

  it("saves form values and updates the shell operator", async () => {
    const onOperatorChanged = vi.fn();
    const onSettingsSaved = vi.fn();
    renderSettings(onOperatorChanged, onSettingsSaved);

    const displayName = await screen.findByDisplayValue("Local Administrator");
    fireEvent.change(displayName, { target: { value: "Platform Administrator" } });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(api.saveManagedSettings).toHaveBeenCalledTimes(1));
    expect(api.saveManagedSettings.mock.calls[0][0]).toMatchObject({
      operator: { display_name: "Platform Administrator" },
      jenkins: {
        base_url: "https://jenkins.company.example",
        job_include_patterns: ["platform-*"],
      },
    });
    expect(onOperatorChanged).toHaveBeenCalledWith({
      id: "local-admin",
      displayName: "Platform Administrator",
      role: "admin",
      source: "config",
    });
    expect(onSettingsSaved).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText("Settings saved and collectors reloaded."),
    ).toBeInTheDocument();
  });

  it("tests the current Jenkins fields without saving", async () => {
    renderSettings();

    await screen.findByDisplayValue("https://jenkins.company.example");
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));

    await waitFor(() => expect(api.testJenkinsConnection).toHaveBeenCalledTimes(1));
    expect(api.saveManagedSettings).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Connection successful. Jenkins returned 4 jobs."),
    ).toBeInTheDocument();
  });

  it("explains why saving is disabled for public defaults", async () => {
    api.fetchManagedSettings.mockResolvedValue({
      ...managedSettings,
      storage: {
        writable: false,
        source: "public_defaults",
        message: "Run the installer to enable saving.",
      },
    });
    renderSettings();

    expect(await screen.findByText("Saving is not enabled for this installation")).toBeInTheDocument();
    expect(screen.getByText("Run the installer to enable saving.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save settings" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Test connection" })).toBeDisabled();
    expect(screen.getByDisplayValue("Local Administrator")).toBeDisabled();
  });
});

function renderSettings(onOperatorChanged = vi.fn(), onSettingsSaved = vi.fn()) {
  return render(
    <SettingsPage
      appConfig={defaultAppConfig}
      theme="light"
      onToggleTheme={vi.fn()}
      onOperatorChanged={onOperatorChanged}
      onSettingsSaved={onSettingsSaved}
    />,
  );
}
