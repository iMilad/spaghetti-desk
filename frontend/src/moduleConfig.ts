export type FeatureModuleId = "services" | "vms" | "licenses" | "permissions" | "agents";

export type ViewId = "overview" | "services" | "vms" | "agents";

export type OverviewWidgetId =
  | "runtime-model"
  | "service-health"
  | "vm-ownership"
  | "license-renewals"
  | "permission-risk"
  | "agent-activity";

export type FeatureModuleConfig = {
  id: FeatureModuleId;
  label: string;
  enabled: boolean;
  showInOverview: boolean;
  description: string;
};

export type NavigationItemConfig = {
  id: ViewId;
  label: string;
  moduleId?: FeatureModuleId;
};

export type OverviewWidgetConfig = {
  id: OverviewWidgetId;
  label: string;
  moduleId?: FeatureModuleId;
  defaultVisible: boolean;
};

export const featureModules: Record<FeatureModuleId, FeatureModuleConfig> = {
  services: {
    id: "services",
    label: "Services",
    enabled: true,
    showInOverview: true,
    description: "Service catalog, ownership, maintenance, monitoring, and risk state.",
  },
  vms: {
    id: "vms",
    label: "VMs",
    enabled: true,
    showInOverview: true,
    description: "VM ownership, freshness, patch status, and review workflows.",
  },
  licenses: {
    id: "licenses",
    label: "Licenses",
    enabled: true,
    showInOverview: true,
    description: "License, support, certificate, token, and renewal visibility.",
  },
  permissions: {
    id: "permissions",
    label: "Permissions",
    enabled: true,
    showInOverview: false,
    description: "Permission drift, stale accounts, admin users, and audit risk.",
  },
  agents: {
    id: "agents",
    label: "Agents",
    enabled: true,
    showInOverview: true,
    description: "Agent sessions, approvals, commands, outcomes, and review state.",
  },
};

export const navigationItems: NavigationItemConfig[] = [
  { id: "overview", label: "Overview" },
  { id: "services", label: "Services", moduleId: "services" },
  { id: "vms", label: "VMs", moduleId: "vms" },
  { id: "agents", label: "Agents", moduleId: "agents" },
];

export const overviewWidgets: OverviewWidgetConfig[] = [
  { id: "runtime-model", label: "Runtime model", defaultVisible: true },
  {
    id: "service-health",
    label: "Services snapshot",
    moduleId: "services",
    defaultVisible: true,
  },
  {
    id: "vm-ownership",
    label: "VM ownership",
    moduleId: "vms",
    defaultVisible: true,
  },
  {
    id: "license-renewals",
    label: "License renewals",
    moduleId: "licenses",
    defaultVisible: true,
  },
  {
    id: "permission-risk",
    label: "Permission risk",
    moduleId: "permissions",
    defaultVisible: false,
  },
  {
    id: "agent-activity",
    label: "Agent activity",
    moduleId: "agents",
    defaultVisible: true,
  },
];

export function getEnabledNavigationItems(
  modules: Record<FeatureModuleId, FeatureModuleConfig> = featureModules,
) {
  return navigationItems.filter((item) => {
    if (!item.moduleId) {
      return true;
    }
    return modules[item.moduleId].enabled;
  });
}

export function getAvailableOverviewWidgets(
  modules: Record<FeatureModuleId, FeatureModuleConfig> = featureModules,
) {
  return overviewWidgets.filter((widget) => {
    if (!widget.moduleId) {
      return true;
    }
    return modules[widget.moduleId].enabled;
  });
}

export function getDefaultOverviewWidgetIds(
  modules: Record<FeatureModuleId, FeatureModuleConfig> = featureModules,
) {
  return getAvailableOverviewWidgets(modules)
    .filter((widget) => {
      if (!widget.moduleId) {
        return widget.defaultVisible;
      }

      const moduleConfig = modules[widget.moduleId];
      return widget.defaultVisible && moduleConfig.showInOverview;
    })
    .map((widget) => widget.id);
}

