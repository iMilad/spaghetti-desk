export type FeatureModuleId =
  | "services"
  | "vms"
  | "licenses"
  | "permissions"
  | "agents"
  | "pipelines";

export type ViewId =
  | "overview"
  | "services"
  | "pipelines"
  | "vms"
  | "licenses"
  | "permissions"
  | "agents"
  | "collectors";

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

export type AppConfig = {
  modules: Record<FeatureModuleId, FeatureModuleConfig>;
  preferences: {
    overviewWidgetStorageKey: string;
  };
  navigationItems: NavigationItemConfig[];
  overviewWidgets: OverviewWidgetConfig[];
};

export const featureModules: Record<FeatureModuleId, FeatureModuleConfig> = {
  services: {
    id: "services",
    label: "Services",
    enabled: true,
    showInOverview: true,
    description: "Service catalog, ownership, maintenance, monitoring, and risk state.",
  },
  pipelines: {
    id: "pipelines",
    label: "Pipelines",
    enabled: true,
    showInOverview: true,
    description: "CI/CD pipeline catalog, ownership, status, and last-run state.",
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
  { id: "pipelines", label: "Pipelines", moduleId: "pipelines" },
  { id: "vms", label: "VMs", moduleId: "vms" },
  { id: "licenses", label: "Licenses", moduleId: "licenses" },
  { id: "permissions", label: "Permissions", moduleId: "permissions" },
  { id: "agents", label: "Agents", moduleId: "agents" },
  { id: "collectors", label: "Collectors" },
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

export const defaultAppConfig: AppConfig = {
  modules: featureModules,
  preferences: {
    overviewWidgetStorageKey: "spaghetti-desk.overview-widgets.v1",
  },
  navigationItems,
  overviewWidgets,
};

export function normalizeAppConfig(config: AppConfig): AppConfig {
  return {
    modules: {
      ...featureModules,
      ...config.modules,
    },
    preferences: config.preferences ?? defaultAppConfig.preferences,
    navigationItems: config.navigationItems ?? navigationItems,
    overviewWidgets: config.overviewWidgets ?? overviewWidgets,
  };
}

export function getEnabledNavigationItems(config: AppConfig = defaultAppConfig) {
  return config.navigationItems.filter((item) => {
    if (!item.moduleId) {
      return true;
    }
    return config.modules[item.moduleId].enabled;
  });
}

export function getAvailableOverviewWidgets(config: AppConfig = defaultAppConfig) {
  return config.overviewWidgets.filter((widget) => {
    if (!widget.moduleId) {
      return true;
    }
    return config.modules[widget.moduleId].enabled;
  });
}

export function getDefaultOverviewWidgetIds(config: AppConfig = defaultAppConfig) {
  return getAvailableOverviewWidgets(config)
    .filter((widget) => {
      if (!widget.moduleId) {
        return widget.defaultVisible;
      }

      const moduleConfig = config.modules[widget.moduleId];
      return widget.defaultVisible && moduleConfig.showInOverview;
    })
    .map((widget) => widget.id);
}
