import { Boxes } from "lucide-react";

import type { CollectorStatus } from "./types";
import { Pill, titleCase } from "./ui";
import type { Tone } from "./ui";

export function CollectorsPage({ collectors }: { collectors: CollectorStatus[] }) {
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
