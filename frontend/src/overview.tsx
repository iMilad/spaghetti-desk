import type { ReactNode } from "react";

import type { AppConfig, FeatureModuleId } from "./moduleConfig";
import type { Screen } from "./shell";
import type {
  CollectorStatus,
  DashboardData,
  License,
} from "./types";
import {
  daysUntil,
  formatRelative,
  pipelineTone,
  titleCase,
  toneRank,
} from "./ui";
import type { Tone } from "./ui";

type Kpi = {
  id: FeatureModuleId;
  label: string;
  value: number;
  unit?: string;
  denom?: string;
  valueTone?: Tone;
  sub: string;
  subTone?: Tone;
  screen: Screen;
};

type Finding = {
  id: string;
  tone: Tone;
  text: string;
  tag: string;
  fact: string;
  factRisk?: boolean;
  screen: Screen;
  age: number;
};

export function OverviewPage({
  data,
  appConfig,
  onNavigate,
}: {
  data: DashboardData;
  appConfig: AppConfig;
  onNavigate: (screen: Screen) => void;
}) {
  const enabled = (id: FeatureModuleId) => appConfig.modules[id].enabled;

  const kpis = buildKpis(data, enabled);
  const findings = buildFindings(data, enabled);
  const shownFindings = findings.slice(0, 7);
  const showHorizon = enabled("licenses") || enabled("agents");

  return (
    <section className="page" aria-label="Overview dashboard">
      <h1 className="sr-only">Overview</h1>
      <div className="overview">
        {kpis.length > 0 ? (
          <div className="kpi-strip">
            {kpis.map((kpi) => (
              <button
                type="button"
                className="kpi"
                key={kpi.id}
                onClick={() => onNavigate(kpi.screen)}
              >
                <span className="kpi__label">{kpi.label}</span>
                <span
                  className={`kpi__value ${kpi.valueTone ? `kpi__value--${kpi.valueTone}` : ""}`}
                >
                  {kpi.value}
                  {kpi.unit ? <span className="kpi__denom"> {kpi.unit}</span> : null}
                  {kpi.denom ? <span className="kpi__denom">{kpi.denom}</span> : null}
                </span>
                <span className={`kpi__sub ${kpi.subTone ? `kpi__sub--${kpi.subTone}` : ""}`}>
                  {kpi.sub}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="overview__row overview__row--2-1">
          <article className="card" aria-label="Needs attention">
            <div className="panel__head">
              <span className="panel__title">Needs attention</span>
              <span className="panel__count mono">{findings.length}</span>
              <span className="panel__spacer" />
            </div>
            {shownFindings.length > 0 ? (
              shownFindings.map((finding) => (
                <button
                  type="button"
                  className="feed-row"
                  key={finding.id}
                  onClick={() => onNavigate(finding.screen)}
                >
                  <span className="pill__dot" style={dotStyle(finding.tone)} aria-hidden="true" />
                  <span className="feed-row__text">{finding.text}</span>
                  <span className="feed-row__spacer" />
                  <span className="feed-row__tag">{finding.tag}</span>
                  <span
                    className={`feed-row__fact mono ${finding.factRisk ? "feed-row__fact--risk" : ""}`}
                  >
                    {finding.fact}
                  </span>
                </button>
              ))
            ) : (
              <div className="table-empty">
                <strong>Nothing needs attention</strong>
                <span>All tracked state is healthy as of the last sync.</span>
              </div>
            )}
          </article>

          <article className="card" aria-label="Collector health">
            <div className="panel__head">
              <span className="panel__title">Collector health</span>
              <span className="panel__spacer" />
              <button type="button" className="link" onClick={() => onNavigate("collectors")}>
                Manage
              </button>
            </div>
            {data.collectors.length > 0 ? (
              data.collectors.map((collector) => (
                <CollectorHealthRow collector={collector} key={collector.name} />
              ))
            ) : (
              <div className="table-empty">
                <strong>No collectors</strong>
                <span>Modules show manually-entered records.</span>
              </div>
            )}
          </article>
        </div>

        {showHorizon ? (
          <div className="overview__row overview__row--3-2">
            {enabled("licenses") ? (
              <LicenseHorizon licenses={data.licenses} onNavigate={onNavigate} />
            ) : (
              <span />
            )}
            {enabled("agents") ? (
              <RecentActivity data={data} onNavigate={onNavigate} />
            ) : (
              <span />
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- KPIs */

function buildKpis(data: DashboardData, enabled: (id: FeatureModuleId) => boolean): Kpi[] {
  const s = data.summary;
  const kpis: Kpi[] = [];

  if (enabled("services")) {
    const total = s.service_count;
    const notHealthy = s.degraded_service_count;
    kpis.push({
      id: "services",
      label: "Services healthy",
      value: Math.max(0, total - notHealthy),
      denom: ` / ${total}`,
      sub: notHealthy > 0 ? `${notHealthy} not healthy` : "all healthy",
      subTone: notHealthy > 0 ? "warning" : undefined,
      screen: "services",
    });
  }

  if (enabled("vms")) {
    const review = s.review_needed_vm_count;
    const unknown = s.unknown_owner_vm_count;
    kpis.push({
      id: "vms",
      label: "VMs needing review",
      value: review,
      valueTone: review > 0 ? "warning" : undefined,
      sub: `of ${s.vm_count}${unknown > 0 ? ` · ${unknown} unknown owner` : ""}`,
      screen: "vms",
    });
  }

  if (enabled("licenses")) {
    const soon = data.licenses.filter((license) => withinDays(license.expires_on, 30));
    const next = soonestLicense(data.licenses);
    const nextDays = next ? daysUntil(next.expires_on) : null;
    kpis.push({
      id: "licenses",
      label: "Licenses ≤ 30 d",
      value: soon.length,
      valueTone: soon.length > 0 ? "warning" : undefined,
      sub: next && nextDays !== null ? `next: ${next.name} · ${Math.max(0, nextDays)} d` : "none upcoming",
      screen: "licenses",
    });
  }

  if (enabled("pipelines")) {
    const total = data.pipelines.length;
    const unhealthy = data.pipelines.filter((pipeline) => pipelineTone(pipeline.status) !== "ok");
    kpis.push({
      id: "pipelines",
      label: "Pipelines healthy",
      value: Math.max(0, total - unhealthy.length),
      denom: total > 0 ? ` / ${total}` : undefined,
      sub:
        total === 0
          ? "no pipelines tracked"
          : unhealthy.length > 0
            ? `${unhealthy.length} need attention`
            : "all healthy",
      subTone: unhealthy.length > 0 ? "warning" : undefined,
      screen: "pipelines",
    });
  }

  if (enabled("permissions")) {
    const high = s.high_risk_permission_count;
    kpis.push({
      id: "permissions",
      label: "Permission findings",
      value: high,
      valueTone: high > 0 ? "risk" : undefined,
      sub: `${s.permission_count} tracked`,
      screen: "permissions",
    });
  }

  if (enabled("agents")) {
    const review = s.agent_sessions_needing_review;
    kpis.push({
      id: "agents",
      label: "Agent sessions",
      value: review,
      unit: "need review",
      valueTone: review > 0 ? "warning" : undefined,
      sub: `of ${s.agent_session_count} sessions`,
      screen: "agents",
    });
  }

  return kpis;
}

/* -------------------------------------------------------------- findings */

function buildFindings(
  data: DashboardData,
  enabled: (id: FeatureModuleId) => boolean,
): Finding[] {
  const findings: Finding[] = [];

  if (enabled("services")) {
    for (const service of data.services) {
      if (service.status === "healthy") {
        continue;
      }
      const tone = service.status === "degraded" ? "warning" : "risk";
      findings.push({
        id: `svc-${service.id}`,
        tone,
        text: `${service.name} ${service.status}${service.owner_team ? "" : " — no owner"}`,
        tag: "Services",
        fact: service.lifecycle,
        screen: "services",
        age: tone === "risk" ? 900 : 400,
      });
    }
  }

  if (enabled("vms")) {
    for (const vm of data.vms) {
      if (vm.review_status === "active") {
        continue;
      }
      const tone = vm.review_status === "delete_candidate" ? "risk" : "warning";
      const label = vm.review_status === "delete_candidate" ? "delete candidate" : "unreviewed";
      const age = daysSince(vm.last_seen_at);
      findings.push({
        id: `vm-${vm.id}`,
        tone,
        text: `${vm.name} — ${label}`,
        tag: "VMs",
        fact: formatRelative(vm.last_seen_at),
        screen: "vms",
        age,
      });
    }
  }

  if (enabled("licenses")) {
    for (const license of data.licenses) {
      const days = daysUntil(license.expires_on);
      const soon = days !== null && days <= 30;
      if (!soon && license.renewal_status === "active") {
        continue;
      }
      const tone: Tone = days !== null && days <= 7 ? "risk" : "warning";
      findings.push({
        id: `lic-${license.id}`,
        tone,
        text:
          days !== null
            ? `${license.name} renews in ${Math.max(0, days)} d`
            : `${license.name} — renewal review`,
        tag: "Licenses",
        fact: days !== null ? `${Math.max(0, days)} d` : titleCase(license.renewal_status),
        factRisk: tone === "risk",
        screen: "licenses",
        age: days !== null ? 800 - days : 300,
      });
    }
  }

  if (enabled("permissions")) {
    for (const permission of data.permissions) {
      if (permission.risk_level === "low") {
        continue;
      }
      const tone = permission.risk_level === "high" ? "risk" : "warning";
      findings.push({
        id: `perm-${permission.id}`,
        tone,
        text: `${permission.principal} · ${permission.role} on ${permission.system}`,
        tag: "Permissions",
        fact: formatRelative(permission.last_seen_at),
        screen: "permissions",
        age: daysSince(permission.last_seen_at),
      });
    }
  }

  if (enabled("pipelines")) {
    for (const pipeline of data.pipelines) {
      const tone = pipelineTone(pipeline.status);
      if (tone === "ok") {
        continue;
      }
      findings.push({
        id: `pipe-${pipeline.id}`,
        tone: tone === "neutral" ? "warning" : tone,
        text: `${pipeline.name} ${humanStatus(pipeline.status)}`,
        tag: "Pipelines",
        fact: pipeline.last_run_at ? formatRelative(pipeline.last_run_at) : pipeline.provider,
        screen: "pipelines",
        age: pipeline.last_run_at ? daysSince(pipeline.last_run_at) : 250,
      });
    }
  }

  for (const collector of data.collectors) {
    if (collector.installed && !collector.enabled) {
      findings.push({
        id: `col-${collector.name}`,
        tone: "warning",
        text: `${titleCase(collector.name)} collector disabled`,
        tag: "Collectors",
        fact: "disabled",
        screen: "collectors",
        age: 200,
      });
    }
  }

  if (enabled("agents")) {
    for (const session of data.agentSessions) {
      if (session.status === "completed") {
        continue;
      }
      findings.push({
        id: `agt-${session.id}`,
        tone: "warning",
        text: `${session.id} needs review — ${session.target}`,
        tag: "Agents",
        fact: formatRelative(session.started_at),
        screen: "agents",
        age: daysSince(session.started_at),
      });
    }
  }

  return findings.sort((a, b) =>
    toneRank[a.tone] !== toneRank[b.tone] ? toneRank[a.tone] - toneRank[b.tone] : b.age - a.age,
  );
}

/* ------------------------------------------------------------ subcomponents */

function CollectorHealthRow({ collector }: { collector: CollectorStatus }) {
  const tone: Tone = collector.installed && collector.enabled ? "ok" : "neutral";
  const muted = !collector.installed;
  const meta = collector.enabled
    ? `every ${formatInterval(collector.interval_seconds)}`
    : collector.installed
      ? "disabled"
      : "not installed";
  return (
    <div className="health-row">
      <span className="pill__dot" style={dotStyle(tone)} aria-hidden="true" />
      <span className={`health-row__name ${muted ? "health-row__name--muted" : ""}`}>
        {collector.name}
      </span>
      <span className="health-row__spacer" />
      <span className={`health-row__meta ${collector.enabled ? "" : "health-row__meta--muted"}`}>
        {meta}
      </span>
    </div>
  );
}

function LicenseHorizon({
  licenses,
  onNavigate,
}: {
  licenses: License[];
  onNavigate: (screen: Screen) => void;
}) {
  const ticks = licenses
    .map((license) => ({ license, days: daysUntil(license.expires_on) }))
    .filter((entry): entry is { license: License; days: number } => entry.days !== null)
    .filter((entry) => entry.days >= 0 && entry.days <= 90)
    .sort((a, b) => a.days - b.days);

  return (
    <article className="card" aria-label="License renewals next 90 days">
      <div className="panel__head">
        <span className="panel__title">License renewals — next 90 days</span>
        <span className="panel__spacer" />
        <button type="button" className="link" onClick={() => onNavigate("licenses")}>
          Licenses
        </button>
      </div>
      <div className="horizon">
        {ticks.length > 0 ? (
          <div className="horizon__track">
            <span className="horizon__bound" style={{ left: 0 }}>
              today
            </span>
            <span className="horizon__bound" style={{ right: 0 }}>
              +90 d
            </span>
            <div className="horizon__line" aria-hidden="true" />
            {ticks.map(({ license, days }) => {
              const left = `${Math.min(96, Math.max(2, (days / 90) * 100))}%`;
              const color = horizonColor(days);
              return (
                <div key={license.id}>
                  <span
                    className="horizon__tick"
                    style={{ left, background: color }}
                    aria-hidden="true"
                  />
                  <span className="horizon__tick-label" style={{ left, color }}>
                    {license.name} · {days} d
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="table-empty">
            <strong>No licenses expiring in the next 90 days</strong>
            <span>Tracking {licenses.length} licenses.</span>
          </div>
        )}
      </div>
    </article>
  );
}

function RecentActivity({
  data,
  onNavigate,
}: {
  data: DashboardData;
  onNavigate: (screen: Screen) => void;
}) {
  const recent = [...data.agentSessions]
    .sort((a, b) => (b.started_at ?? "").localeCompare(a.started_at ?? ""))
    .slice(0, 3);

  return (
    <article className="card" aria-label="Recent activity">
      <div className="panel__head">
        <span className="panel__title">Recent activity</span>
        <span className="panel__spacer" />
        <button type="button" className="link" onClick={() => onNavigate("agents")}>
          Agent sessions
        </button>
      </div>
      {recent.length > 0 ? (
        recent.map((session) => (
          <div className="activity-row" key={session.id}>
            <span>
              <strong>{session.operator}</strong> {activityVerb(session.status)}{" "}
              <span className="mono">{session.target}</span>
            </span>
            <span className="activity-row__spacer" />
            <span className="activity-row__time">
              {formatRelative(session.ended_at ?? session.started_at)}
            </span>
          </div>
        ))
      ) : (
        <div className="table-empty">
          <strong>No recent activity</strong>
          <span>Agent sessions will appear here.</span>
        </div>
      )}
    </article>
  );
}

/* ---------------------------------------------------------------- helpers */

function dotStyle(tone: Tone): { background: string } {
  return { background: `var(--${tone}-dot)` };
}

function withinDays(dateStr: string, days: number): boolean {
  const remaining = daysUntil(dateStr);
  return remaining !== null && remaining <= days;
}

function soonestLicense(licenses: License[]): License | null {
  return [...licenses]
    .filter((license) => daysUntil(license.expires_on) !== null)
    .sort((a, b) => (daysUntil(a.expires_on) ?? 0) - (daysUntil(b.expires_on) ?? 0))[0] ?? null;
}

function daysSince(value: string | null): number {
  const days = daysUntil(value);
  return days === null ? 0 : Math.max(0, -days);
}

function horizonColor(days: number): string {
  if (days <= 7) {
    return "var(--risk-fg)";
  }
  if (days <= 30) {
    return "var(--warning-fg)";
  }
  return "var(--color-text-tertiary)";
}

function activityVerb(status: string): ReactNode {
  return status === "completed" ? "completed session on" : "opened session on";
}

function humanStatus(status: string): string {
  return status.includes("_") || status.includes("-") ? titleCase(status) : status;
}

function formatInterval(seconds: number | null): string {
  if (!seconds) {
    return "manual";
  }
  if (seconds % 3600 === 0) {
    return `${seconds / 3600} h`;
  }
  if (seconds % 60 === 0) {
    return `${seconds / 60} m`;
  }
  return `${seconds} s`;
}
