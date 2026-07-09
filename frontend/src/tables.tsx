import { Plus, Rows3, Search, SlidersHorizontal, X } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AgentSession, License, Permission, Pipeline, Service, VM } from "./types";
import {
  Avatar,
  Pill,
  agentTone,
  daysLeftTone,
  daysUntil,
  formatAbsolute,
  formatRelative,
  getDensity,
  humanize,
  monitoringTone,
  ownershipTone,
  patchTone,
  pipelineTone,
  renewalTone,
  reviewTone,
  riskTone,
  rowHeight,
  serviceTone,
  setDensity,
} from "./ui";
import type { Density, Tone } from "./ui";

/* ------------------------------------------------------------------ types */

export type Column<T> = {
  key: string;
  header: string;
  value: (row: T) => string;
  cell?: (row: T) => ReactNode;
  mono?: boolean;
  align?: "end";
  grow?: number;
  sortable?: boolean;
  sortValue?: (row: T) => number | string;
  priority?: 2 | 3;
};

export type Facet<T> = {
  key: string;
  label: string;
  options: string[];
  value: (row: T) => string;
};

export type DetailDescriptor = {
  title: string;
  id?: string;
  badges?: { tone: Tone; label: string }[];
  sections?: { label: string; rows: { k: string; v: ReactNode }[] }[];
  lists?: { label: string; items: string[] }[];
  links?: { label: string; href?: string }[];
  note?: string;
};

type ActiveFilter = { facet: string; value: string };

/* ------------------------------------------------------------- DataTable */

export function DataTable<T>({
  title,
  unit,
  rows,
  totalCount,
  getId,
  columns,
  facets = [],
  detail,
  searchPlaceholder,
  asOf,
  exportName,
}: {
  title: string;
  unit: string;
  rows: T[];
  totalCount?: number;
  getId: (row: T) => string;
  columns: Column<T>[];
  facets?: Facet<T>[];
  detail?: (row: T) => DetailDescriptor;
  searchPlaceholder?: string;
  asOf?: string | null;
  exportName?: string;
}) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<ActiveFilter[]>([]);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [density, setDensityState] = useState<Density>(() => getDensity());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const searchRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const total = totalCount ?? rows.length;
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const byFacet = new Map<string, string[]>();
    for (const filter of filters) {
      byFacet.set(filter.facet, [...(byFacet.get(filter.facet) ?? []), filter.value]);
    }

    let list = rows.filter((row) => {
      const matchesSearch =
        !query ||
        columns.some((column) => column.value(row).toLowerCase().includes(query));
      const matchesFacets = [...byFacet.entries()].every(([facetKey, values]) => {
        const facet = facets.find((candidate) => candidate.key === facetKey);
        return facet ? values.includes(facet.value(row)) : true;
      });
      return matchesSearch && matchesFacets;
    });

    if (sortKey) {
      const column = columns.find((candidate) => candidate.key === sortKey);
      if (column) {
        const read = column.sortValue ?? column.value;
        list = [...list].sort((a, b) => {
          const av = read(a);
          const bv = read(b);
          const result =
            typeof av === "number" && typeof bv === "number"
              ? av - bv
              : String(av).localeCompare(String(bv));
          return result * sortDir;
        });
      }
    }

    return list;
  }, [rows, columns, facets, search, filters, sortKey, sortDir]);

  const selected = useMemo(
    () => (selectedId ? filtered.find((row) => getId(row) === selectedId) ?? null : null),
    [filtered, getId, selectedId],
  );

  const changeDensity = useCallback(() => {
    setDensityState((current) => {
      const next: Density =
        current === "compact" ? "default" : current === "default" ? "relaxed" : "compact";
      setDensity(next);
      return next;
    });
  }, []);

  const toggleSort = useCallback((key: string) => {
    setSortKey((currentKey) => {
      if (currentKey === key) {
        setSortDir((dir) => (dir === 1 ? -1 : 1));
        return key;
      }
      setSortDir(1);
      return key;
    });
  }, []);

  const addFilter = useCallback((facet: string, value: string) => {
    setFilters((current) =>
      current.some((filter) => filter.facet === facet && filter.value === value)
        ? current
        : [...current, { facet, value }],
    );
    setFilterMenuOpen(false);
    setFocusedIndex(-1);
  }, []);

  const removeFilter = useCallback((facet: string, value: string) => {
    setFilters((current) =>
      current.filter((filter) => !(filter.facet === facet && filter.value === value)),
    );
    setFocusedIndex(-1);
  }, []);

  // Keyboard: "/" focuses search, j/k move, Enter opens, Esc closes.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      if (typing) {
        if (event.key === "Escape") {
          (target as HTMLInputElement).blur();
        }
        return;
      }
      if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        setFocusedIndex((index) => Math.min(filtered.length - 1, index + 1));
      } else if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        setFocusedIndex((index) => Math.max(0, index - 1));
      } else if (event.key === "Enter") {
        const row = filtered[focusedIndex];
        if (row) {
          setSelectedId(getId(row));
        }
      } else if (event.key === "Escape") {
        if (filterMenuOpen) {
          setFilterMenuOpen(false);
        } else {
          setSelectedId(null);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [filtered, focusedIndex, filterMenuOpen, getId]);

  // Move DOM focus to the keyboard-focused row so the ring follows j/k.
  useEffect(() => {
    if (focusedIndex < 0) {
      return;
    }
    const el = bodyRef.current?.querySelector<HTMLElement>(`[data-row="${focusedIndex}"]`);
    el?.focus();
  }, [focusedIndex]);

  const gridTemplate = columns
    .map((column) => `${column.grow ?? 1}fr`)
    .join(" ");
  const minWidth = Math.max(680, columns.length * 120);

  const filtersActive = filters.length > 0 || search.trim().length > 0;
  const countText = `${filtered.length} of ${total} ${unit}${filtersActive ? " · filtered" : ""}`;

  return (
    <div className="table-wrap">
      <div className="table-main">
        <div className="page-head">
          <h1 className="page-head__title">{title}</h1>
          <span className="page-head__count mono">{total}</span>
          <span className="page-head__spacer" />
          {exportName ? (
            <button
              type="button"
              className="btn btn--strong"
              onClick={() => exportCsv(exportName, columns, filtered)}
            >
              Export CSV
            </button>
          ) : null}
        </div>

        <div className="toolbar">
          <label className="toolbar__search">
            <Search aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              aria-label={`Filter ${title}`}
              placeholder={searchPlaceholder ?? `Filter ${unit}…   /`}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setFocusedIndex(-1);
              }}
            />
          </label>

          {filters.map((filter) => (
            <button
              type="button"
              className="filter-chip"
              key={`${filter.facet}:${filter.value}`}
              onClick={() => removeFilter(filter.facet, filter.value)}
              title="Remove filter"
            >
              {facetLabel(facets, filter.facet)}: {humanize(filter.value)}
              <X aria-hidden="true" />
            </button>
          ))}

          {facets.length > 0 ? (
            <button
              type="button"
              className="btn btn--dashed"
              aria-expanded={filterMenuOpen}
              onClick={() => setFilterMenuOpen((open) => !open)}
            >
              <Plus aria-hidden="true" />
              Filter
            </button>
          ) : null}

          <span className="toolbar__spacer" />

          <button
            type="button"
            className="btn"
            onClick={changeDensity}
            title="Cycle row density"
          >
            <Rows3 aria-hidden="true" />
            {humanize(density)}
          </button>
          <button type="button" className="btn" disabled title="Column picker — not wired">
            <SlidersHorizontal aria-hidden="true" />
            Columns
          </button>

          {filterMenuOpen ? (
            <div className="filter-menu" role="menu" aria-label="Add filter">
              {facets.map((facet) => (
                <div key={facet.key}>
                  <div className="filter-menu__group-label">{facet.label}</div>
                  {facet.options.map((option) => (
                    <button
                      type="button"
                      className="filter-menu__option"
                      key={option}
                      role="menuitem"
                      onClick={() => addFilter(facet.key, option)}
                    >
                      {humanize(option)}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="table">
          <div className="table__scroll" ref={bodyRef}>
            <div className="table__head" style={{ gridTemplateColumns: gridTemplate, minWidth }}>
              {columns.map((column) => (
                <span key={column.key} className={columnClass(column)}>
                  {column.sortable ? (
                    <button
                      type="button"
                      className="table__col-btn"
                      onClick={() => toggleSort(column.key)}
                    >
                      {column.header}
                      <span aria-hidden="true">{sortGlyph(sortKey, sortDir, column.key)}</span>
                    </button>
                  ) : (
                    column.header
                  )}
                </span>
              ))}
            </div>

            {filtered.length > 0 ? (
              filtered.map((row, index) => {
                const id = getId(row);
                const isSelected = id === selectedId;
                const isFocused = index === focusedIndex;
                return (
                  <div
                    key={id}
                    role="button"
                    tabIndex={0}
                    data-row={index}
                    aria-label={`Open ${columns[0].value(row)}`}
                    className={`table__row ${isSelected ? "is-selected" : ""} ${
                      isFocused ? "is-focused" : ""
                    }`}
                    style={
                      {
                        gridTemplateColumns: gridTemplate,
                        minWidth,
                        "--row-h": `${rowHeight[density]}px`,
                      } as CSSProperties
                    }
                    onClick={() => {
                      setSelectedId(id);
                      setFocusedIndex(index);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedId(id);
                      }
                    }}
                  >
                    {columns.map((column) => (
                      <span key={column.key} className={cellClass(column)}>
                        {column.cell ? column.cell(row) : column.value(row)}
                      </span>
                    ))}
                  </div>
                );
              })
            ) : (
              <div className="table-empty">
                <strong>No matching rows</strong>
                <span>
                  {filtersActive
                    ? "Clear the search or filters to see more."
                    : `No ${unit} available.`}
                </span>
              </div>
            )}
          </div>

          <div className="table__foot">
            <span className="tnum">{countText}</span>
            <span className="table__foot-spacer" />
            <span className="table__hint">j/k move · Enter open · Esc close</span>
            {asOf ? (
              <span className="table__asof" title={formatAbsolute(asOf)}>
                as of {formatRelative(asOf)}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {selected && detail ? (
        <DetailPanel descriptor={detail(selected)} onClose={() => setSelectedId(null)} />
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------- detail panel */

function DetailPanel({
  descriptor,
  onClose,
}: {
  descriptor: DetailDescriptor;
  onClose: () => void;
}) {
  return (
    <aside className="detail" aria-label={`${descriptor.title} detail`}>
      <div className="detail__head">
        <div style={{ minWidth: 0 }}>
          <div className="detail__title">{descriptor.title}</div>
          {descriptor.id ? <div className="detail__id">{descriptor.id}</div> : null}
        </div>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className="detail__close"
          aria-label="Close detail (Esc)"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </button>
      </div>
      <div className="detail__body">
        {descriptor.badges && descriptor.badges.length > 0 ? (
          <div className="detail__badges">
            {descriptor.badges.map((badge) => (
              <Pill tone={badge.tone} key={badge.label}>
                {badge.label}
              </Pill>
            ))}
          </div>
        ) : null}

        {descriptor.sections?.map((section) => (
          <div key={section.label}>
            <div className="detail__section-label">{section.label}</div>
            <dl className="detail__grid">
              {section.rows.map((row) => (
                <div key={row.k} style={{ display: "contents" }}>
                  <dt>{row.k}</dt>
                  <dd>{row.v}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}

        {descriptor.lists?.map((list) =>
          list.items.length > 0 ? (
            <div key={list.label}>
              <div className="detail__section-label">{list.label}</div>
              <ul className="detail__list">
                {list.items.map((item, index) => (
                  <li key={`${list.label}-${index}`}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null,
        )}

        {descriptor.links && descriptor.links.length > 0 ? (
          <div>
            <div className="detail__section-label">Links</div>
            <div className="detail__links">
              {descriptor.links.map((link) =>
                link.href ? (
                  <a
                    className="btn"
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {link.label} ↗
                  </a>
                ) : null,
              )}
            </div>
          </div>
        ) : null}

        {descriptor.note ? <div className="detail__note">{descriptor.note}</div> : null}
      </div>
    </aside>
  );
}

/* --------------------------------------------------------- shared helpers */

function columnClass<T>(column: Column<T>): string {
  return [column.align === "end" ? "table__col--end" : "", priorityClass(column)]
    .filter(Boolean)
    .join(" ");
}

function cellClass<T>(column: Column<T>): string {
  return [
    "cell",
    column.mono ? "cell--mono" : "",
    column.align === "end" ? "cell--end" : "",
    priorityClass(column),
  ]
    .filter(Boolean)
    .join(" ");
}

function priorityClass<T>(column: Column<T>): string {
  return column.priority ? `col-priority-${column.priority}` : "";
}

function sortGlyph(sortKey: string | null, sortDir: 1 | -1, key: string): string {
  if (sortKey !== key) {
    return "";
  }
  return sortDir === 1 ? "▲" : "▼";
}

function facetLabel<T>(facets: Facet<T>[], key: string): string {
  return facets.find((facet) => facet.key === key)?.label ?? key;
}

function uniq<T>(rows: T[], read: (row: T) => string): string[] {
  return [...new Set(rows.map(read).filter(Boolean))].sort();
}

function exportCsv<T>(name: string, columns: Column<T>[], rows: T[]): void {
  if (typeof document === "undefined") {
    return;
  }
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const header = columns.map((column) => escape(column.header)).join(",");
  const body = rows
    .map((row) => columns.map((column) => escape(column.value(row))).join(","))
    .join("\n");
  const blob = new Blob([`${header}\n${body}\n`], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${name}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function ownerCell(name: string): ReactNode {
  const unassigned = !name || name === "—" || name.toLowerCase() === "unknown";
  if (unassigned) {
    return <Pill tone="warning">Unassigned</Pill>;
  }
  return (
    <span className="cell--owner">
      <Avatar label={name} size="sm" />
      <span>{name}</span>
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

function formatDurationMs(value: number | null): string {
  if (value === null) {
    return "—";
  }
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

function metadataList(metadata: Record<string, string>): string[] {
  return Object.entries(metadata).map(([key, value]) => `${key}: ${value}`);
}

function pipelineSortWeight(status: string): number {
  switch (pipelineTone(status)) {
    case "risk":
      return 0;
    case "warning":
      return 1;
    case "info":
      return 2;
    case "ok":
      return 3;
    default:
      return 4;
  }
}

/* ================================================================ pages == */

export function ServicesPage({
  services,
  loadedAt,
}: {
  services: Service[];
  loadedAt: string | null;
}) {
  const columns: Column<Service>[] = [
    { key: "name", header: "Service", value: (s) => s.name, grow: 1.6, sortable: true },
    { key: "type", header: "Type", value: (s) => s.service_type, mono: true, grow: 1 },
    {
      key: "owner",
      header: "Owner",
      value: (s) => s.owner_team,
      cell: (s) => ownerCell(s.owner_team),
      grow: 1.2,
    },
    { key: "version", header: "Version", value: (s) => s.version, mono: true, grow: 0.9 },
    {
      key: "health",
      header: "Health",
      value: (s) => humanize(s.status),
      cell: (s) => <Pill tone={serviceTone(s.status)}>{humanize(s.status)}</Pill>,
      grow: 0.9,
    },
    {
      key: "monitoring",
      header: "Monitoring",
      value: (s) => humanize(s.monitoring_status),
      cell: (s) => (
        <Pill tone={monitoringTone(s.monitoring_status)}>{humanize(s.monitoring_status)}</Pill>
      ),
      grow: 1,
      priority: 2,
    },
    {
      key: "maintenance",
      header: "Last maint.",
      value: (s) => s.last_maintenance,
      cell: (s) => relCell(s.last_maintenance),
      grow: 0.9,
      sortable: true,
      priority: 3,
    },
  ];

  const facets: Facet<Service>[] = [
    { key: "type", label: "Type", options: uniq(services, (s) => s.service_type), value: (s) => s.service_type },
    { key: "health", label: "Health", options: uniq(services, (s) => s.status), value: (s) => s.status },
    {
      key: "monitoring",
      label: "Monitoring",
      options: uniq(services, (s) => s.monitoring_status),
      value: (s) => s.monitoring_status,
    },
  ];

  return (
    <DataTable
      title="Services"
      unit="services"
      rows={services}
      getId={(s) => s.id}
      columns={columns}
      facets={facets}
      asOf={loadedAt}
      exportName="services"
      detail={(s) => ({
        title: s.name,
        id: s.id,
        badges: [
          { tone: serviceTone(s.status), label: humanize(s.status) },
          { tone: monitoringTone(s.monitoring_status), label: `Monitoring ${s.monitoring_status}` },
        ],
        sections: [
          {
            label: "State",
            rows: [
              { k: "Type", v: <span className="mono">{s.service_type}</span> },
              { k: "Version", v: <span className="mono">{s.version}</span> },
              { k: "Lifecycle", v: humanize(s.lifecycle) },
              { k: "Last maintenance", v: relCell(s.last_maintenance) },
              { k: "Backup", v: humanize(s.backup_status) },
            ],
          },
          { label: "Ownership", rows: [{ k: "Team", v: s.owner_team }] },
        ],
        lists: [{ label: "Known risks", items: s.known_risks }],
        links: [
          { label: "Documentation", href: s.documentation_url },
          { label: "Service", href: s.example_url },
        ],
        note: "Record from local database. Ownership changes are audited.",
      })}
    />
  );
}

export function PipelinesPage({
  pipelines,
  loadedAt,
}: {
  pipelines: Pipeline[];
  loadedAt: string | null;
}) {
  const columns: Column<Pipeline>[] = [
    { key: "name", header: "Pipeline", value: (p) => p.name, grow: 1.7, sortable: true },
    { key: "provider", header: "Provider", value: (p) => p.provider, mono: true, grow: 0.9 },
    {
      key: "owner",
      header: "Owner",
      value: (p) => p.owner_team,
      cell: (p) => ownerCell(p.owner_team),
      grow: 1.2,
    },
    {
      key: "status",
      header: "Status",
      value: (p) => humanize(p.status),
      cell: (p) => <Pill tone={pipelineTone(p.status)}>{humanize(p.status)}</Pill>,
      grow: 0.9,
      sortable: true,
      sortValue: (p) => pipelineSortWeight(p.status),
    },
    {
      key: "last_run_status",
      header: "Last run",
      value: (p) => humanize(p.last_run_status ?? "unknown"),
      cell: (p) => (
        <Pill tone={pipelineTone(p.last_run_status ?? "unknown")}>
          {humanize(p.last_run_status ?? "unknown")}
        </Pill>
      ),
      grow: 0.9,
      priority: 2,
    },
    {
      key: "last_run_at",
      header: "Run time",
      value: (p) => p.last_run_at ?? "",
      cell: (p) => relCell(p.last_run_at),
      grow: 1,
      sortable: true,
      sortValue: (p) => new Date(p.last_run_at ?? 0).getTime(),
      priority: 2,
    },
    {
      key: "duration",
      header: "Duration",
      value: (p) => formatDurationMs(p.last_duration_ms),
      mono: true,
      align: "end",
      grow: 0.8,
      sortable: true,
      sortValue: (p) => p.last_duration_ms ?? 0,
      priority: 3,
    },
  ];

  const facets: Facet<Pipeline>[] = [
    {
      key: "provider",
      label: "Provider",
      options: uniq(pipelines, (p) => p.provider),
      value: (p) => p.provider,
    },
    {
      key: "status",
      label: "Status",
      options: uniq(pipelines, (p) => p.status),
      value: (p) => p.status,
    },
    {
      key: "owner",
      label: "Owner",
      options: uniq(pipelines, (p) => p.owner_team),
      value: (p) => p.owner_team,
    },
  ];

  return (
    <DataTable
      title="Pipelines"
      unit="pipelines"
      rows={pipelines}
      getId={(p) => p.id}
      columns={columns}
      facets={facets}
      searchPlaceholder="Filter pipelines by name, provider, owner, or status…   /"
      asOf={loadedAt}
      exportName="pipelines"
      detail={(p) => ({
        title: p.name,
        id: p.id,
        badges: [
          { tone: pipelineTone(p.status), label: humanize(p.status) },
          {
            tone: pipelineTone(p.last_run_status ?? "unknown"),
            label: `Last run ${humanize(p.last_run_status ?? "unknown")}`,
          },
        ],
        sections: [
          {
            label: "State",
            rows: [
              { k: "Provider", v: <span className="mono">{p.provider}</span> },
              { k: "Source ID", v: <span className="mono">{p.source_id}</span> },
              { k: "Last run", v: p.last_run_at ? relCell(p.last_run_at) : "No run recorded" },
              { k: "Duration", v: <span className="mono">{formatDurationMs(p.last_duration_ms)}</span> },
            ],
          },
          { label: "Ownership", rows: [{ k: "Team", v: p.owner_team }] },
        ],
        lists: [{ label: "Collector metadata", items: metadataList(p.metadata) }],
        links: [{ label: "Pipeline", href: p.source_url }],
        note:
          "Pipeline records are local inventory state written by collectors. This view does not call external CI systems.",
      })}
    />
  );
}

export function VMsPage({ vms, loadedAt }: { vms: VM[]; loadedAt: string | null }) {
  const columns: Column<VM>[] = [
    { key: "name", header: "Host", value: (v) => v.name, mono: true, grow: 1.5, sortable: true },
    {
      key: "owner",
      header: "Owner",
      value: (v) => (v.ownership_confidence === "unknown" ? "Unassigned" : v.owner),
      cell: (v) => (v.ownership_confidence === "unknown" ? ownerCell("") : ownerCell(v.owner)),
      grow: 1.2,
    },
    { key: "team", header: "Team", value: (v) => v.team, grow: 1, priority: 2 },
    { key: "env", header: "Env", value: (v) => v.environment, mono: true, grow: 0.9 },
    {
      key: "capacity",
      header: "Capacity",
      value: (v) => `${v.cpu} CPU / ${v.ram_gb} GB`,
      mono: true,
      grow: 1,
      priority: 3,
    },
    {
      key: "patch",
      header: "Patch",
      value: (v) => humanize(v.patch_status),
      cell: (v) => <Pill tone={patchTone(v.patch_status)}>{humanize(v.patch_status)}</Pill>,
      grow: 0.9,
      priority: 2,
    },
    {
      key: "review",
      header: "Review",
      value: (v) => humanize(v.review_status),
      cell: (v) => <Pill tone={reviewTone(v.review_status)}>{humanize(v.review_status)}</Pill>,
      grow: 1,
      sortable: true,
    },
  ];

  const facets: Facet<VM>[] = [
    { key: "env", label: "Environment", options: uniq(vms, (v) => v.environment), value: (v) => v.environment },
    { key: "review", label: "Review", options: uniq(vms, (v) => v.review_status), value: (v) => v.review_status },
    { key: "patch", label: "Patch", options: uniq(vms, (v) => v.patch_status), value: (v) => v.patch_status },
    {
      key: "ownership",
      label: "Ownership",
      options: uniq(vms, (v) => v.ownership_confidence),
      value: (v) => v.ownership_confidence,
    },
  ];

  return (
    <DataTable
      title="Virtual machines"
      unit="VMs"
      rows={vms}
      getId={(v) => v.id}
      columns={columns}
      facets={facets}
      asOf={loadedAt}
      exportName="virtual-machines"
      detail={(v) => ({
        title: v.name,
        id: v.id,
        badges: [
          { tone: reviewTone(v.review_status), label: humanize(v.review_status) },
          { tone: patchTone(v.patch_status), label: `Patch ${v.patch_status}` },
        ],
        sections: [
          {
            label: "State",
            rows: [
              { k: "Environment", v: <span className="mono">{v.environment}</span> },
              { k: "OS", v: v.os },
              { k: "Capacity", v: <span className="mono">{`${v.cpu} CPU / ${v.ram_gb} GB / ${v.disk_gb} GB`}</span> },
              { k: "IP", v: <span className="mono">{v.ip_address}</span> },
              { k: "Last seen", v: relCell(v.last_seen_at) },
            ],
          },
          {
            label: "Ownership",
            rows: [
              { k: "Owner", v: v.ownership_confidence === "unknown" ? "Unassigned" : v.owner },
              { k: "Team", v: v.team },
              { k: "Confidence", v: <Pill tone={ownershipTone(v.ownership_confidence)}>{humanize(v.ownership_confidence)}</Pill> },
            ],
          },
        ],
        lists: [{ label: "Tags", items: v.tags }],
        note: v.purpose
          ? `${v.purpose} Ownership changes are audited.`
          : "Record from local database. Ownership changes are audited.",
      })}
    />
  );
}

export function LicensesPage({
  licenses,
  loadedAt,
}: {
  licenses: License[];
  loadedAt: string | null;
}) {
  const columns: Column<License>[] = [
    { key: "name", header: "Name", value: (l) => l.name, grow: 1.4, sortable: true },
    { key: "vendor", header: "Vendor", value: (l) => l.vendor, grow: 1 },
    { key: "category", header: "Category", value: (l) => l.category, mono: true, grow: 1, priority: 2 },
    {
      key: "owner",
      header: "Owner",
      value: (l) => l.owner_team,
      cell: (l) => ownerCell(l.owner_team),
      grow: 1.2,
      priority: 3,
    },
    {
      key: "expires",
      header: "Expires",
      value: (l) => l.expires_on,
      cell: (l) => expiresCell(l.expires_on),
      grow: 1.1,
      sortable: true,
    },
    {
      key: "status",
      header: "Status",
      value: (l) => humanize(l.renewal_status),
      cell: (l) => <Pill tone={renewalTone(l.renewal_status)}>{humanize(l.renewal_status)}</Pill>,
      grow: 0.9,
    },
  ];

  const facets: Facet<License>[] = [
    { key: "category", label: "Category", options: uniq(licenses, (l) => l.category), value: (l) => l.category },
    { key: "status", label: "Status", options: uniq(licenses, (l) => l.renewal_status), value: (l) => l.renewal_status },
  ];

  return (
    <DataTable
      title="Licenses"
      unit="licenses"
      rows={licenses}
      getId={(l) => l.id}
      columns={columns}
      facets={facets}
      asOf={loadedAt}
      exportName="licenses"
      detail={(l) => {
        const days = daysUntil(l.expires_on);
        return {
          title: l.name,
          id: l.id,
          badges: [{ tone: renewalTone(l.renewal_status), label: humanize(l.renewal_status) }],
          sections: [
            {
              label: "State",
              rows: [
                { k: "Vendor", v: l.vendor },
                { k: "Category", v: <span className="mono">{l.category}</span> },
                { k: "Expires", v: <span className="mono">{l.expires_on}</span> },
                {
                  k: "Days left",
                  v:
                    days !== null ? (
                      <span style={{ color: `var(--${daysLeftTone(days)}-fg)`, fontWeight: 500 }}>
                        {days} d
                      </span>
                    ) : (
                      "—"
                    ),
                },
              ],
            },
            { label: "Ownership", rows: [{ k: "Team", v: l.owner_team }] },
          ],
          note: l.risk,
        };
      }}
    />
  );
}

export function PermissionsPage({
  permissions,
  loadedAt,
}: {
  permissions: Permission[];
  loadedAt: string | null;
}) {
  const columns: Column<Permission>[] = [
    { key: "principal", header: "Principal", value: (p) => p.principal, mono: true, grow: 1.8, sortable: true },
    { key: "system", header: "System", value: (p) => p.system, grow: 1 },
    { key: "role", header: "Role", value: (p) => p.role, grow: 1 },
    {
      key: "risk",
      header: "Risk",
      value: (p) => humanize(p.risk_level),
      cell: (p) => <Pill tone={riskTone(p.risk_level)}>{humanize(p.risk_level)}</Pill>,
      grow: 0.8,
      sortable: true,
      sortValue: (p) => ({ high: 0, medium: 1, low: 2 })[p.risk_level] ?? 3,
    },
    {
      key: "seen",
      header: "Last seen",
      value: (p) => p.last_seen_at,
      cell: (p) => relCell(p.last_seen_at),
      grow: 1,
      sortable: true,
      priority: 2,
    },
  ];

  const facets: Facet<Permission>[] = [
    { key: "risk", label: "Risk", options: uniq(permissions, (p) => p.risk_level), value: (p) => p.risk_level },
    { key: "system", label: "System", options: uniq(permissions, (p) => p.system), value: (p) => p.system },
  ];

  return (
    <DataTable
      title="Permissions"
      unit="permissions"
      rows={permissions}
      getId={(p) => p.id}
      columns={columns}
      facets={facets}
      asOf={loadedAt}
      exportName="permissions"
      detail={(p) => ({
        title: p.principal,
        id: p.id,
        badges: [{ tone: riskTone(p.risk_level), label: `${humanize(p.risk_level)} risk` }],
        sections: [
          {
            label: "State",
            rows: [
              { k: "System", v: p.system },
              { k: "Role", v: p.role },
              { k: "Last seen", v: relCell(p.last_seen_at) },
            ],
          },
        ],
        note: "Permission findings move Open → Acknowledged → Resolved. Review is audited.",
      })}
    />
  );
}

export function AgentsPage({
  sessions,
  loadedAt,
}: {
  sessions: AgentSession[];
  loadedAt: string | null;
}) {
  const columns: Column<AgentSession>[] = [
    { key: "id", header: "Session", value: (s) => s.id, mono: true, grow: 1, sortable: true },
    { key: "target", header: "Target", value: (s) => s.target, mono: true, grow: 1.2 },
    {
      key: "status",
      header: "Status",
      value: (s) => humanize(s.status),
      cell: (s) => <Pill tone={agentTone(s.status)}>{humanize(s.status)}</Pill>,
      grow: 1,
      sortable: true,
    },
    {
      key: "approval",
      header: "Approval",
      value: (s) => (s.approval_required ? "Required" : "Not required"),
      cell: (s) => (
        <Pill tone={s.approval_required ? "warning" : "neutral"}>
          {s.approval_required ? "Required" : "Not required"}
        </Pill>
      ),
      grow: 1,
      priority: 2,
    },
    { key: "outcome", header: "Outcome", value: (s) => s.outcome, grow: 1.8, priority: 3 },
  ];

  const facets: Facet<AgentSession>[] = [
    { key: "status", label: "Status", options: uniq(sessions, (s) => s.status), value: (s) => s.status },
    {
      key: "approval",
      label: "Approval",
      options: ["Required", "Not required"],
      value: (s) => (s.approval_required ? "Required" : "Not required"),
    },
  ];

  return (
    <DataTable
      title="Agent sessions"
      unit="sessions"
      rows={sessions}
      getId={(s) => s.id}
      columns={columns}
      facets={facets}
      asOf={loadedAt}
      exportName="agent-sessions"
      detail={(s) => ({
        title: s.id,
        id: s.target,
        badges: [
          { tone: agentTone(s.status), label: humanize(s.status) },
          { tone: s.approval_required ? "warning" : "neutral", label: s.approval_required ? "Approval required" : "No approval" },
        ],
        sections: [
          {
            label: "State",
            rows: [
              { k: "Operator", v: s.operator },
              { k: "Target", v: <span className="mono">{s.target}</span> },
              { k: "Started", v: relCell(s.started_at) },
              { k: "Ended", v: s.ended_at ? relCell(s.ended_at) : "running" },
            ],
          },
        ],
        lists: [
          { label: "Files changed", items: s.files_changed },
          { label: "Commands run", items: s.commands_run },
        ],
        note: `${s.task_summary} — ${s.outcome}`,
      })}
    />
  );
}

function expiresCell(expires: string): ReactNode {
  const days = daysUntil(expires);
  return (
    <span className="mono">
      {expires}
      {days !== null ? (
        <span style={{ color: `var(--${daysLeftTone(days)}-fg)` }}>{` · ${days} d`}</span>
      ) : null}
    </span>
  );
}
