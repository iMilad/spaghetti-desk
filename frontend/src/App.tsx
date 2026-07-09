import { TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchDashboard, fetchInitialAppData } from "./api";
import { CollectorsPage } from "./collectors";
import { defaultAppConfig, getEnabledNavigationItems } from "./moduleConfig";
import type { AppConfig } from "./moduleConfig";
import { OverviewPage } from "./overview";
import { DashboardFrame } from "./shell";
import type { NavBadge, Screen } from "./shell";
import {
  AgentsPage,
  LicensesPage,
  PermissionsPage,
  PipelinesPage,
  ServicesPage,
  VMsPage,
} from "./tables";
import type { CollectorStatus, DashboardData } from "./types";
import { getDensity, getTheme, pipelineTone, setDensity, setTheme } from "./ui";
import type { Density, Tone } from "./ui";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; appConfig: AppConfig; data: DashboardData; refreshing: boolean }
  | { status: "error"; message: string };

export default function App() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [theme, setThemeState] = useState<"light" | "dark">(() => getTheme());

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const next = current === "dark" ? "light" : "dark";
      setTheme(next);
      return next;
    });
  }, []);

  const load = useCallback((mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") {
      setState({ status: "loading" });
    } else {
      setState((current) =>
        current.status === "ready" ? { ...current, refreshing: true } : current,
      );
    }

    const request =
      mode === "initial"
        ? fetchInitialAppData()
        : fetchDashboard().then((dashboard) => ({ appConfig: null, dashboard }));

    return request
      .then(({ appConfig, dashboard }) => {
        setState((current) => {
          if (appConfig) {
            return { status: "ready", appConfig, data: dashboard, refreshing: false };
          }
          return current.status === "ready"
            ? { ...current, data: dashboard, refreshing: false }
            : current;
        });
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Unable to load inventory";
        setState({ status: "error", message });
      });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(() => void load("refresh"), [load]);

  if (state.status === "loading") {
    return <LoadingScreen theme={theme} onToggleTheme={toggleTheme} />;
  }

  if (state.status === "error") {
    return (
      <ErrorScreen
        theme={theme}
        message={state.message}
        onToggleTheme={toggleTheme}
        onRetry={() => void load()}
      />
    );
  }

  return (
    <Dashboard
      appConfig={state.appConfig}
      data={state.data}
      refreshing={state.refreshing}
      theme={theme}
      onToggleTheme={toggleTheme}
      onRefresh={refresh}
    />
  );
}

export function Dashboard({
  appConfig = defaultAppConfig,
  data,
  refreshing = false,
  theme: themeProp,
  onToggleTheme,
  onRefresh = () => undefined,
}: {
  appConfig?: AppConfig;
  data: DashboardData;
  refreshing?: boolean;
  theme?: "light" | "dark";
  onToggleTheme?: () => void;
  onRefresh?: () => void;
}) {
  const [localTheme, setLocalTheme] = useState<"light" | "dark">(() => getTheme());
  const theme = themeProp ?? localTheme;
  const toggleTheme =
    onToggleTheme ??
    (() =>
      setLocalTheme((current) => {
        const next = current === "dark" ? "light" : "dark";
        setTheme(next);
        return next;
      }));

  const enabledViews = useMemo(
    () => getEnabledNavigationItems(appConfig).map((item) => item.id),
    [appConfig],
  );
  const validScreens = useMemo(
    () => new Set<Screen>([...enabledViews, "overview", "collectors", "settings"]),
    [enabledViews],
  );

  const [activeScreen, setActiveScreen] = useState<Screen>(() =>
    screenFromHash(validScreens),
  );

  useEffect(() => {
    const sync = () => setActiveScreen(screenFromHash(validScreens));
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, [validScreens]);

  useEffect(() => {
    if (!validScreens.has(activeScreen)) {
      setActiveScreen("overview");
    }
  }, [activeScreen, validScreens]);

  const navigate = useCallback(
    (screen: Screen) => {
      if (!validScreens.has(screen)) {
        return;
      }
      setActiveScreen(screen);
      const nextHash = `#${screen}`;
      if (window.location.hash !== nextHash) {
        window.history.pushState(null, "", nextHash);
      }
    },
    [validScreens],
  );

  // Global ⌘K / Ctrl+K opens the (Services-scoped) search.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        navigate("services");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate]);

  const badges = useMemo(() => buildBadges(data, appConfig), [data, appConfig]);
  const collectorTone = collectorNavTone(data.collectors);
  const freshness = refreshing
    ? { tone: "info" as Tone, label: "Sync running…" }
    : { tone: "ok" as Tone, label: `Synced ${relative(data.summary.loaded_at)}` };
  const collectorHealth = collectorAttention(data.collectors);
  const loadedAt = data.summary.loaded_at;

  return (
    <DashboardFrame
      activeScreen={activeScreen}
      enabledViews={enabledViews}
      badges={badges}
      collectorTone={collectorTone}
      freshness={freshness}
      collectorHealth={collectorHealth}
      theme={theme}
      refreshing={refreshing}
      onToggleTheme={toggleTheme}
      onRefresh={onRefresh}
      onNavigate={navigate}
    >
      {activeScreen === "overview" ? (
        <OverviewPage data={data} appConfig={appConfig} onNavigate={navigate} />
      ) : null}
      {activeScreen === "services" ? (
        <ServicesPage services={data.services} loadedAt={loadedAt} />
      ) : null}
      {activeScreen === "pipelines" ? (
        <PipelinesPage pipelines={data.pipelines} loadedAt={loadedAt} />
      ) : null}
      {activeScreen === "vms" ? <VMsPage vms={data.vms} loadedAt={loadedAt} /> : null}
      {activeScreen === "licenses" ? (
        <LicensesPage licenses={data.licenses} loadedAt={loadedAt} />
      ) : null}
      {activeScreen === "permissions" ? (
        <PermissionsPage permissions={data.permissions} loadedAt={loadedAt} />
      ) : null}
      {activeScreen === "agents" ? (
        <AgentsPage sessions={data.agentSessions} loadedAt={loadedAt} />
      ) : null}
      {activeScreen === "collectors" ? (
        <CollectorsPage collectors={data.collectors} runs={data.collectorRuns} />
      ) : null}
      {activeScreen === "settings" ? (
        <SettingsPage appConfig={appConfig} theme={theme} onToggleTheme={toggleTheme} />
      ) : null}
    </DashboardFrame>
  );
}

/* --------------------------------------------------------------- settings */

function SettingsPage({
  appConfig,
  theme,
  onToggleTheme,
}: {
  appConfig: AppConfig;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}) {
  const [density, setDensityValue] = useState<Density>(() => getDensity());
  const modules = Object.values(appConfig.modules);

  const chooseDensity = (value: Density) => {
    setDensity(value);
    setDensityValue(value);
  };

  return (
    <section className="page" aria-label="Settings">
      <div className="page-head">
        <h1 className="page-head__title">Settings</h1>
      </div>

      <div style={{ display: "grid", gap: 12, maxWidth: 640 }}>
        <article className="card">
          <div className="panel__head">
            <span className="panel__title">Appearance</span>
          </div>
          <div className="detail__body">
            <div>
              <div className="detail__section-label">Theme</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className={`btn btn--md ${theme === "light" ? "btn--primary" : "btn--strong"}`}
                  onClick={() => theme !== "light" && onToggleTheme()}
                >
                  Light
                </button>
                <button
                  type="button"
                  className={`btn btn--md ${theme === "dark" ? "btn--primary" : "btn--strong"}`}
                  onClick={() => theme !== "dark" && onToggleTheme()}
                >
                  Dark
                </button>
              </div>
            </div>
            <div>
              <div className="detail__section-label">Table density</div>
              <div style={{ display: "flex", gap: 8 }}>
                {(["compact", "default", "relaxed"] as Density[]).map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={`btn btn--md ${density === value ? "btn--primary" : "btn--strong"}`}
                    onClick={() => chooseDensity(value)}
                  >
                    {value.charAt(0).toUpperCase() + value.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </article>

        <article className="card">
          <div className="panel__head">
            <span className="panel__title">Enabled modules</span>
            <span className="panel__count mono">
              {modules.filter((module) => module.enabled).length}
            </span>
          </div>
          <div className="detail__body">
            <dl className="detail__grid">
              {modules.map((module) => (
                <div key={module.id} style={{ display: "contents" }}>
                  <dt>{module.label}</dt>
                  <dd>{module.enabled ? "enabled" : "disabled"}</dd>
                </div>
              ))}
            </dl>
            <div className="detail__note">
              Modules are controlled by deployment config (served from{" "}
              <span className="mono">/api/v1/app-config</span>). Disabled modules do not render.
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- states */

function LoadingScreen({
  theme,
  onToggleTheme,
}: {
  theme: "light" | "dark";
  onToggleTheme: () => void;
}) {
  return (
    <DashboardFrame
      activeScreen="overview"
      enabledViews={getEnabledNavigationItems(defaultAppConfig).map((item) => item.id)}
      freshness={{ tone: "info", label: "Loading…" }}
      theme={theme}
      onToggleTheme={onToggleTheme}
      onNavigate={() => undefined}
    >
      <section className="page" aria-label="Loading inventory" aria-busy="true">
        <h1 className="sr-only">Loading</h1>
        <div className="overview">
          <div className="kpi-strip">
            {Array.from({ length: 6 }, (_, index) => (
              <div className="kpi" key={index} aria-hidden="true">
                <span className="skeleton" style={{ width: "60%", height: 10 }} />
                <span className="skeleton" style={{ width: "40%", height: 22, marginTop: 8 }} />
              </div>
            ))}
          </div>
          <article className="card" aria-hidden="true">
            {Array.from({ length: 6 }, (_, index) => (
              <div className="skeleton skeleton-row" key={index} />
            ))}
          </article>
        </div>
      </section>
    </DashboardFrame>
  );
}

function ErrorScreen({
  theme,
  message,
  onToggleTheme,
  onRetry,
}: {
  theme: "light" | "dark";
  message: string;
  onToggleTheme: () => void;
  onRetry: () => void;
}) {
  return (
    <DashboardFrame
      activeScreen="overview"
      enabledViews={getEnabledNavigationItems(defaultAppConfig).map((item) => item.id)}
      freshness={{ tone: "risk", label: "Sync failed" }}
      theme={theme}
      onToggleTheme={onToggleTheme}
      onNavigate={() => undefined}
    >
      <section className="page" aria-label="Inventory unavailable">
        <h1 className="sr-only">Inventory unavailable</h1>
        <div className="state-strip" role="alert" style={{ maxWidth: 560 }}>
          <TriangleAlert aria-hidden="true" />
          <div>
            <div className="state-strip__title">Couldn&apos;t load inventory</div>
            <div className="state-strip__detail">{message}</div>
            <div className="state-strip__actions">
              <button type="button" className="btn btn--strong" onClick={onRetry}>
                Retry
              </button>
            </div>
          </div>
        </div>
      </section>
    </DashboardFrame>
  );
}

/* ---------------------------------------------------------------- helpers */

function screenFromHash(valid: Set<Screen>): Screen {
  if (typeof window === "undefined") {
    return "overview";
  }
  const raw = window.location.hash.replace("#", "") as Screen;
  return valid.has(raw) ? raw : "overview";
}

function buildBadges(
  data: DashboardData,
  appConfig: AppConfig,
): Partial<Record<Screen, NavBadge>> {
  const badges: Partial<Record<Screen, NavBadge>> = {};
  const s = data.summary;
  if (appConfig.modules.vms.enabled && s.review_needed_vm_count > 0) {
    badges.vms = { count: s.review_needed_vm_count, tone: "warning" };
  }
  if (appConfig.modules.licenses.enabled && s.renewal_review_count > 0) {
    badges.licenses = { count: s.renewal_review_count, tone: "warning" };
  }
  if (appConfig.modules.permissions.enabled && s.high_risk_permission_count > 0) {
    badges.permissions = { count: s.high_risk_permission_count, tone: "risk" };
  }
  if (appConfig.modules.pipelines.enabled) {
    const unhealthy = data.pipelines.filter((pipeline) => pipelineTone(pipeline.status) !== "ok");
    if (unhealthy.length > 0) {
      badges.pipelines = {
        count: unhealthy.length,
        tone: unhealthy.some((pipeline) => pipelineTone(pipeline.status) === "risk")
          ? "risk"
          : "warning",
      };
    }
  }
  return badges;
}

function collectorNavTone(collectors: CollectorStatus[]): Tone {
  const installed = collectors.filter((collector) => collector.installed);
  if (installed.some((collector) => !collector.enabled)) {
    return "warning";
  }
  if (installed.some((collector) => collector.enabled)) {
    return "ok";
  }
  return "neutral";
}

function collectorAttention(
  collectors: CollectorStatus[],
): { tone: Tone; label: string } | null {
  const disabled = collectors.filter(
    (collector) => collector.installed && !collector.enabled,
  ).length;
  if (disabled > 0) {
    return { tone: "warning", label: `${disabled} disabled` };
  }
  return null;
}

function relative(value: string): string {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) {
    return "—";
  }
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes} m ago`;
  }
  if (minutes < 1440) {
    return `${Math.round(minutes / 60)} h ago`;
  }
  return `${Math.round(minutes / 1440)} d ago`;
}
