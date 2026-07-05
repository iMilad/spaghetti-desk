import { describe, expect, it } from "vitest";

import {
  defaultAppConfig,
  getAvailableOverviewWidgets,
  getDefaultOverviewWidgetIds,
  getEnabledNavigationItems,
} from "./moduleConfig";

describe("moduleConfig", () => {
  it("removes navigation and overview widgets when a feature module is disabled", () => {
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

    expect(getEnabledNavigationItems(appConfig).map((item) => item.id)).toEqual([
      "overview",
      "services",
      "licenses",
      "permissions",
      "agents",
      "collectors",
    ]);
    expect(getAvailableOverviewWidgets(appConfig).map((widget) => widget.id)).not.toContain(
      "vm-ownership",
    );
    expect(getDefaultOverviewWidgetIds(appConfig)).not.toContain("vm-ownership");
  });

  it("uses backend-provided module overview defaults", () => {
    const appConfig = {
      ...defaultAppConfig,
      modules: {
        ...defaultAppConfig.modules,
        permissions: {
          ...defaultAppConfig.modules.permissions,
          showInOverview: true,
        },
      },
      overviewWidgets: defaultAppConfig.overviewWidgets.map((widget) =>
        widget.id === "permission-risk" ? { ...widget, defaultVisible: true } : widget,
      ),
    };

    expect(getDefaultOverviewWidgetIds(defaultAppConfig)).not.toContain("permission-risk");
    expect(getDefaultOverviewWidgetIds(appConfig)).toContain("permission-risk");
  });
});
