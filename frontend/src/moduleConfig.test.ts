import { describe, expect, it } from "vitest";

import {
  featureModules,
  getAvailableOverviewWidgets,
  getDefaultOverviewWidgetIds,
  getEnabledNavigationItems,
} from "./moduleConfig";

describe("moduleConfig", () => {
  it("removes navigation and overview widgets when a feature module is disabled", () => {
    const modules = {
      ...featureModules,
      vms: {
        ...featureModules.vms,
        enabled: false,
      },
    };

    expect(getEnabledNavigationItems(modules).map((item) => item.id)).toEqual([
      "overview",
      "services",
      "agents",
    ]);
    expect(getAvailableOverviewWidgets(modules).map((widget) => widget.id)).not.toContain(
      "vm-ownership",
    );
    expect(getDefaultOverviewWidgetIds(modules)).not.toContain("vm-ownership");
  });
});

