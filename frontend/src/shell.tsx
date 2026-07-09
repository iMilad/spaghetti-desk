import {
  Boxes,
  FileCheck,
  GitBranch,
  History,
  LayoutDashboard,
  Moon,
  Package,
  RefreshCcw,
  Search,
  Server,
  Settings2,
  Shield,
  Sun,
  Terminal,
  TriangleAlert,
} from "lucide-react";
import type { ReactNode } from "react";

import type { ViewId } from "./moduleConfig";
import { Avatar, Pill, SpaghettiMark } from "./ui";
import type { Tone } from "./ui";

/** Screens include module views plus static shell chrome (settings, audit). */
export type Screen = ViewId | "settings" | "audit";

type ScreenMeta = {
  navLabel: string;
  title: string;
  section: string;
  icon: ReactNode;
};

const iconProps = {
  width: 15,
  height: 15,
  strokeWidth: 1.75,
  "aria-hidden": true,
} as const;

export const screenMeta: Record<Screen, ScreenMeta> = {
  overview: {
    navLabel: "Overview",
    title: "Overview",
    section: "Control center",
    icon: <LayoutDashboard {...iconProps} />,
  },
  services: {
    navLabel: "Services",
    title: "Services",
    section: "Inventory",
    icon: <Package {...iconProps} />,
  },
  pipelines: {
    navLabel: "Pipelines",
    title: "Pipelines",
    section: "Inventory",
    icon: <GitBranch {...iconProps} />,
  },
  vms: {
    navLabel: "Virtual machines",
    title: "Virtual machines",
    section: "Inventory",
    icon: <Server {...iconProps} />,
  },
  licenses: {
    navLabel: "Licenses",
    title: "Licenses",
    section: "Governance",
    icon: <FileCheck {...iconProps} />,
  },
  permissions: {
    navLabel: "Permissions",
    title: "Permissions",
    section: "Governance",
    icon: <Shield {...iconProps} />,
  },
  agents: {
    navLabel: "Agent sessions",
    title: "Agent sessions",
    section: "Activity",
    icon: <Terminal {...iconProps} />,
  },
  audit: {
    navLabel: "Actions & audit",
    title: "Actions & audit",
    section: "Activity",
    icon: <History {...iconProps} />,
  },
  collectors: {
    navLabel: "Collectors",
    title: "Collectors",
    section: "System",
    icon: <Boxes {...iconProps} />,
  },
  settings: {
    navLabel: "Settings",
    title: "Settings",
    section: "System",
    icon: <Settings2 {...iconProps} />,
  },
};

type NavGroup = { label: string | null; ids: Screen[] };

const NAV_GROUPS: NavGroup[] = [
  { label: null, ids: ["overview"] },
  { label: "Inventory", ids: ["services", "pipelines", "vms"] },
  { label: "Governance", ids: ["licenses", "permissions"] },
  { label: "Activity", ids: ["agents", "audit"] },
  { label: "System", ids: ["collectors", "settings"] },
];

export type NavBadge = { count: number; tone: "warning" | "risk" };

export function DashboardFrame({
  activeScreen,
  enabledViews,
  badges = {},
  collectorTone = "ok",
  freshness,
  collectorHealth = null,
  theme,
  refreshing = false,
  onToggleTheme = () => undefined,
  onRefresh = () => undefined,
  onNavigate,
  children,
}: {
  activeScreen: Screen;
  enabledViews: ViewId[];
  badges?: Partial<Record<Screen, NavBadge>>;
  collectorTone?: Tone;
  freshness: { tone: Tone; label: string };
  collectorHealth?: { tone: Tone; label: string } | null;
  theme: "light" | "dark";
  refreshing?: boolean;
  onToggleTheme?: () => void;
  onRefresh?: () => void;
  onNavigate: (screen: Screen) => void;
  children: ReactNode;
}) {
  const meta = screenMeta[activeScreen];
  const enabled = new Set<Screen>([...enabledViews, "overview", "collectors", "settings", "audit"]);

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>

      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand">
          <SpaghettiMark />
          <span className="brand__name">Spaghetti Desk</span>
          <span className="brand__tag mono">demo</span>
        </div>

        <nav className="nav">
          {NAV_GROUPS.map((group) => {
            const items = group.ids.filter((id) => enabled.has(id));
            if (items.length === 0) {
              return null;
            }
            return (
              <div className="nav__group" key={group.label ?? "top"}>
                {group.label ? <p className="nav__group-label">{group.label}</p> : null}
                {items.map((id) => (
                  <NavItem
                    key={id}
                    screen={id}
                    active={activeScreen === id}
                    badge={badges[id]}
                    collectorTone={id === "collectors" ? collectorTone : undefined}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            );
          })}
        </nav>

        <div className="nav-user">
          <Avatar label="operator" />
          <span className="nav-user__name">operator</span>
          <span className="nav-user__role">admin</span>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <p className="breadcrumb">
            {meta.section} <span className="breadcrumb__sep">/</span>{" "}
            <span className="breadcrumb__page">{meta.title}</span>
          </p>

          <button
            type="button"
            className="topbar__search"
            aria-label="Open global search"
            onClick={() => onNavigate("services")}
          >
            <Search aria-hidden="true" />
            <span>Search…</span>
            <span className="kbd" aria-hidden="true">
              ⌘K
            </span>
          </button>

          <span className="topbar__spacer" />

          <div className="topbar__cluster" aria-live="polite">
            <Pill
              tone={freshness.tone}
              size="md"
              onClick={() => onNavigate("collectors")}
              aria-label={`Data freshness: ${freshness.label}. Open collectors.`}
            >
              {freshness.label}
            </Pill>
            {collectorHealth ? (
              <Pill
                tone={collectorHealth.tone}
                size="md"
                dot={collectorHealth.tone === "ok"}
                icon={
                  collectorHealth.tone === "ok" ? undefined : (
                    <TriangleAlert aria-hidden="true" />
                  )
                }
                onClick={() => onNavigate("collectors")}
                aria-label={`Collector health: ${collectorHealth.label}. Open collectors.`}
              >
                {collectorHealth.label}
              </Pill>
            ) : null}
            <button
              type="button"
              className="icon-btn"
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              onClick={onToggleTheme}
            >
              {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={refreshing ? "Refreshing inventory" : "Refresh inventory"}
              disabled={refreshing}
              onClick={onRefresh}
            >
              <RefreshCcw aria-hidden="true" className={refreshing ? "spin" : undefined} />
            </button>
            <Avatar label="operator" size="lg" />
          </div>
        </header>

        <main className="content" id="main">
          {children}
        </main>
      </div>
    </div>
  );
}

function NavItem({
  screen,
  active,
  badge,
  collectorTone,
  onNavigate,
}: {
  screen: Screen;
  active: boolean;
  badge?: NavBadge;
  collectorTone?: Tone;
  onNavigate: (screen: Screen) => void;
}) {
  const meta = screenMeta[screen];

  if (screen === "audit") {
    return (
      <div className="nav__item" aria-disabled="true">
        {meta.icon}
        <span>{meta.navLabel}</span>
        <em className="nav__tag" aria-label="planned">
          soon
        </em>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`nav__item ${active ? "is-active" : ""}`}
      aria-current={active ? "page" : undefined}
      onClick={() => onNavigate(screen)}
    >
      {meta.icon}
      <span>{meta.navLabel}</span>
      {badge ? (
        <em className={`nav__count nav__count--${badge.tone} mono`}>{badge.count}</em>
      ) : null}
      {collectorTone ? (
        <span
          className="nav__dot"
          style={{ background: `var(--${collectorTone}-dot)` }}
          aria-hidden="true"
        />
      ) : null}
    </button>
  );
}
