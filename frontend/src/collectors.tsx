import { Boxes } from "lucide-react";

import type { CollectorRun, CollectorStatus } from "./types";
import { formatAbsolute, formatRelative, humanize, Pill, titleCase } from "./ui";
import type { Tone } from "./ui";

export function CollectorsPage({
  collectors,
  runs,
}: {
  collectors: CollectorStatus[];
  runs: CollectorRun[];
}) {
  const installed = collectors.filter((collector) => collector.installed);
  const available = collectors.filter((collector) => !collector.installed);

  return (
    <section className="page" aria-label="Collectors">
      <div className="page-head">
        <h1 className="page-head__title">Collectors</h1>
        <span className="page-head__count mono">{installed.length} installed</span>
      </div>

      <div className="section-label">Installed</div>
      {installed.length > 0 ? (
        <div className="collector-grid">
          {installed.map((collector) => (
            <InstalledCard collector={collector} key={collector.name} />
          ))}
        </div>
      ) : (
        <div className="empty-block" style={{ maxWidth: 560 }}>
          <strong>No collector plugins installed</strong>
          <p>
            Spaghetti Desk works with none installed — modules simply show manually-entered
            records. Install only the adapters this deployment needs.
          </p>
        </div>
      )}

      <div className="section-label">Available — not installed</div>
      {available.length > 0 ? (
        <div className="collector-list">
          {available.map((collector) => (
            <div className="collector-list__row" key={collector.name}>
              <span className="collector-list__name">{titleCase(collector.name)}</span>
              <span className="collector-list__pkg">collector-{collector.name}</span>
              <span className="collector-list__spacer" />
              <span className="collector-list__hint">install via package manager</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-block" style={{ maxWidth: 560 }}>
          <strong>All declared collectors are installed</strong>
          <p>New plugin packages can still be added to the deployment later.</p>
        </div>
      )}

      <p className="collector-note">
        Collectors are optional plugins. Package code lives in the public project, while real
        endpoints, tokens, and company mappings stay in ignored local config. Pages read cached
        inventory first — collectors sync in the background so page loads never call external
        systems live. Manual retries and scheduled runs append audited run records.
      </p>

      <section className="collector-runs" aria-label="Recent collector runs">
        <div className="panel__head">
          <span className="panel__title">Recent run history</span>
          <span className="panel__count mono">{runs.length}</span>
        </div>
        {runs.length > 0 ? (
          <div className="collector-run-list">
            {runs.map((run) => (
              <CollectorRunRow run={run} key={run.id} />
            ))}
          </div>
        ) : (
          <div className="table-empty">
            <strong>No collector runs recorded</strong>
            <span>Runs appear here after an enabled collector is scheduled or retried.</span>
          </div>
        )}
      </section>
    </section>
  );
}

function InstalledCard({ collector }: { collector: CollectorStatus }) {
  const enabled = collector.enabled;
  const tone: Tone = enabled ? "ok" : "neutral";
  const badge = enabled ? "Enabled" : "Disabled";

  return (
    <article className={`collector-card ${enabled ? "" : "collector-card--muted"}`}>
      <div className="collector-card__head">
        <span className="collector-card__icon">
          <Boxes aria-hidden="true" />
        </span>
        <div>
          <div className="collector-card__name">{titleCase(collector.name)}</div>
          <div className="collector-card__pkg">collector-{collector.name}</div>
        </div>
        <span
          className={`toggle ${enabled ? "is-on" : ""}`}
          role="img"
          aria-label={
            enabled
              ? "Scheduling enabled (set in deployment config)"
              : "Scheduling disabled (set in deployment config)"
          }
          title="Scheduling is controlled by local deployment config"
        />
      </div>

      <Pill tone={tone} size="lg">
        {badge}
      </Pill>

      <dl className="collector-meta">
        <div className="collector-meta__row">
          <dt>Schedule</dt>
          <dd>{enabled ? `every ${formatInterval(collector.interval_seconds)}` : "paused"}</dd>
        </div>
        <div className="collector-meta__row">
          <dt>Config</dt>
          <dd className={enabled ? "ok" : "warning"}>
            {enabled ? "Configured · local" : "Local file required"}
          </dd>
        </div>
      </dl>

      <div className="collector-card__actions">
        <button
          type="button"
          className="btn btn--md btn--strong"
          disabled
          title="Configure endpoints and secrets in local deployment config"
        >
          Configure
        </button>
      </div>
    </article>
  );
}

function CollectorRunRow({ run }: { run: CollectorRun }) {
  return (
    <div className="collector-run-row">
      <Pill tone={collectorRunTone(run.status)}>{humanize(run.status)}</Pill>
      <span className="collector-run-row__name">{titleCase(run.collector_name)}</span>
      <span className="collector-run-row__message">{run.message || "Run completed"}</span>
      <span className="collector-run-row__stats mono">
        {run.records_seen} seen / {run.records_changed} changed
      </span>
      <span className="collector-run-row__time mono" title={formatAbsolute(run.started_at)}>
        {formatRelative(run.started_at)}
      </span>
    </div>
  );
}

function collectorRunTone(status: string): Tone {
  switch (status) {
    case "success":
      return "ok";
    case "failed":
      return "risk";
    case "skipped":
      return "neutral";
    default:
      return "warning";
  }
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
