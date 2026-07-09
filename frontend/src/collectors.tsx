import type { ReactNode } from "react";

import { DataTable } from "./tables";
import type { Column, DetailDescriptor, Facet } from "./tables";
import type { CollectorRun, CollectorStatus } from "./types";
import { formatAbsolute, formatRelative, humanize, Pill, titleCase } from "./ui";
import type { Tone } from "./ui";

type CollectorRegistryRow = {
  collector: CollectorStatus;
  lastRun: CollectorRun | null;
};

export function CollectorsPage({
  collectors,
  runs,
}: {
  collectors: CollectorStatus[];
  runs: CollectorRun[];
}) {
  const rows = collectors.map((collector) => ({
    collector,
    lastRun: collector.last_run ?? latestRunForCollector(runs, collector.name),
  }));
  const installedCount = collectors.filter((collector) => collector.installed).length;
  const configuredCount = collectors.filter((collector) => collector.configured).length;

  return (
    <section className="page" aria-label="Collectors">
      <RegistryTable rows={rows} />

      <p className="collector-note">
        Collectors are optional plugins. Package code can be public, while real endpoints,
        tokens, and company mappings stay in ignored local config. Pages read cached
        inventory first; collectors sync in the background so page loads never call external
        systems live.
      </p>

      <section className="collector-runs" aria-label="Recent collector runs">
        <div className="panel__head">
          <span className="panel__title">Recent run history</span>
          <span className="panel__count mono">{runs.length}</span>
          <span className="panel__spacer" />
          <span className="panel__meta">
            {installedCount} installed / {configuredCount} configured
          </span>
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

function RegistryTable({ rows }: { rows: CollectorRegistryRow[] }) {
  const columns: Column<CollectorRegistryRow>[] = [
    {
      key: "name",
      header: "Collector",
      value: (row) => row.collector.name,
      cell: (row) => collectorNameCell(row.collector),
      grow: 1.5,
      sortable: true,
    },
    {
      key: "installed",
      header: "Installed",
      value: (row) => stateLabel(row.collector.installed),
      cell: (row) => statePill(row.collector.installed),
      grow: 0.8,
      sortable: true,
    },
    {
      key: "enabled",
      header: "Enabled",
      value: (row) => stateLabel(row.collector.enabled),
      cell: (row) => statePill(row.collector.enabled),
      grow: 0.8,
      sortable: true,
    },
    {
      key: "configured",
      header: "Configured",
      value: (row) => stateLabel(row.collector.configured),
      cell: (row) => statePill(row.collector.configured),
      grow: 0.9,
      sortable: true,
    },
    {
      key: "schedule",
      header: "Schedule",
      value: (row) =>
        row.collector.enabled
          ? `every ${formatInterval(row.collector.interval_seconds)}`
          : "paused",
      mono: true,
      grow: 0.9,
      priority: 2,
    },
    {
      key: "last_run",
      header: "Last run",
      value: (row) => row.lastRun?.started_at ?? "",
      cell: (row) => lastRunCell(row.lastRun),
      grow: 1.5,
      sortable: true,
      sortValue: (row) => new Date(row.lastRun?.started_at ?? 0).getTime(),
      priority: 2,
    },
  ];

  const facets: Facet<CollectorRegistryRow>[] = [
    {
      key: "installed",
      label: "Installed",
      options: ["Yes", "No"],
      value: (row) => stateLabel(row.collector.installed),
    },
    {
      key: "enabled",
      label: "Enabled",
      options: ["Yes", "No"],
      value: (row) => stateLabel(row.collector.enabled),
    },
    {
      key: "configured",
      label: "Configured",
      options: ["Yes", "No"],
      value: (row) => stateLabel(row.collector.configured),
    },
  ];

  return (
    <DataTable
      title="Plugin registry"
      unit="collectors"
      rows={rows}
      totalCount={rows.length}
      getId={(row) => row.collector.name}
      columns={columns}
      facets={facets}
      searchPlaceholder="Filter collectors by name or state...   /"
      exportName="collector-registry"
      detail={collectorDetail}
    />
  );
}

function collectorNameCell(collector: CollectorStatus): ReactNode {
  return (
    <span className="collector-registry-name">
      <span className="collector-registry-name__title">{titleCase(collector.name)}</span>
      <span className="collector-registry-name__pkg">collector-{collector.name}</span>
    </span>
  );
}

function collectorDetail(row: CollectorRegistryRow): DetailDescriptor {
  const collector = row.collector;
  const lastRun = row.lastRun;
  const badges: DetailDescriptor["badges"] = [
    { tone: collector.installed ? "ok" : "neutral", label: installedLabel(collector) },
    { tone: collector.enabled ? "ok" : "neutral", label: enabledLabel(collector) },
    {
      tone: collector.configured ? "ok" : "warning",
      label: configuredLabel(collector),
    },
  ];

  return {
    title: titleCase(collector.name),
    id: `collector-${collector.name}`,
    badges,
    sections: [
      {
        label: "Registry state",
        rows: [
          { k: "Package", v: <span className="mono">collector-{collector.name}</span> },
          { k: "Installed", v: stateText(collector.installed) },
          { k: "Enabled", v: stateText(collector.enabled) },
          { k: "Configured", v: stateText(collector.configured) },
          {
            k: "Schedule",
            v: collector.enabled
              ? `every ${formatInterval(collector.interval_seconds)}`
              : "paused",
          },
        ],
      },
      {
        label: "Last run",
        rows: lastRun
          ? [
              {
                k: "Status",
                v: <Pill tone={collectorRunTone(lastRun.status)}>{humanize(lastRun.status)}</Pill>,
              },
              { k: "Started", v: relCell(lastRun.started_at) },
              {
                k: "Duration",
                v: <span className="mono">{formatDurationMs(lastRun.duration_ms)}</span>,
              },
              {
                k: "Records",
                v: `${lastRun.records_seen} seen / ${lastRun.records_changed} changed`,
              },
              { k: "Dry run", v: lastRun.dry_run ? "yes" : "no" },
            ]
          : [{ k: "Status", v: "No run recorded" }],
      },
    ],
    note: lastRun?.message || "Install and configure only the collector plugins this deployment needs.",
  };
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

function statePill(value: boolean): ReactNode {
  return <Pill tone={value ? "ok" : "neutral"}>{stateLabel(value)}</Pill>;
}

function stateText(value: boolean): ReactNode {
  return <span className={value ? "ok" : "neutral"}>{stateLabel(value)}</span>;
}

function stateLabel(value: boolean): "Yes" | "No" {
  return value ? "Yes" : "No";
}

function installedLabel(collector: CollectorStatus): string {
  return collector.installed ? "Installed" : "Not installed";
}

function enabledLabel(collector: CollectorStatus): string {
  return collector.enabled ? "Enabled" : "Disabled";
}

function configuredLabel(collector: CollectorStatus): string {
  return collector.configured ? "Configured" : "Config missing";
}

function lastRunCell(run: CollectorRun | null): ReactNode {
  if (!run) {
    return <span className="cell--muted">Never</span>;
  }
  return (
    <span className="collector-last-run">
      <Pill tone={collectorRunTone(run.status)}>{humanize(run.status)}</Pill>
      <span className="mono" title={formatAbsolute(run.started_at)}>
        {formatRelative(run.started_at)}
      </span>
    </span>
  );
}

function relCell(value: string | null): ReactNode {
  return (
    <span className="mono" title={formatAbsolute(value)}>
      {formatRelative(value)}
    </span>
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

function latestRunForCollector(
  runs: CollectorRun[],
  collectorName: string,
): CollectorRun | null {
  return (
    runs
      .filter((run) => run.collector_name === collectorName)
      .sort((a, b) => b.started_at.localeCompare(a.started_at))[0] ?? null
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

function formatDurationMs(value: number): string {
  if (value < 1000) {
    return `${value} ms`;
  }
  const seconds = value / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(seconds >= 10 ? 0 : 1)} s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes} m ${remainingSeconds} s`;
}
