import type { ButtonHTMLAttributes, ReactNode } from "react";

/* Signal tones — the only saturated colors in the product. Reserved for state. */
export type Tone = "ok" | "warning" | "risk" | "info" | "neutral";

export type Density = "compact" | "default" | "relaxed";

export const THEME_KEY = "spaghetti-desk.theme";
export const DENSITY_KEY = "spaghetti-desk.density";

/* ------------------------------------------------------------------ pills */

export function Pill({
  tone,
  size,
  icon,
  dot = true,
  outline = false,
  className,
  children,
  onClick,
  title,
  ...rest
}: {
  tone: Tone;
  size?: "md" | "lg";
  icon?: ReactNode;
  dot?: boolean;
  outline?: boolean;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
  title?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "title" | "children">) {
  const classes = [
    "pill",
    `pill--${tone}`,
    size ? `pill--${size}` : "",
    outline ? "pill--outline" : "",
    onClick ? "is-clickable" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const inner = (
    <>
      {icon ?? (dot ? <span className="pill__dot" aria-hidden="true" /> : null)}
      {children}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={classes} onClick={onClick} title={title} {...rest}>
        {inner}
      </button>
    );
  }

  return (
    <span className={classes} title={title}>
      {inner}
    </span>
  );
}

/* ----------------------------------------------------------------- avatar */

export function Avatar({
  label,
  size,
}: {
  label: string;
  size?: "sm" | "lg";
}) {
  const classes = ["avatar", size ? `avatar--${size}` : ""].filter(Boolean).join(" ");
  return (
    <span className={classes} aria-hidden="true">
      {initials(label)}
    </span>
  );
}

export function SpaghettiMark({ size = 18 }: { size?: number }) {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        focusable="false"
      >
        <path d="M12 3a9 9 0 1 0 9 9" />
        <path d="M12 8a4 4 0 1 0 4 4" />
      </svg>
    </span>
  );
}

/* ------------------------------------------------------------- formatters */

export function initials(value: string): string {
  const cleaned = value.replace(/@.*/, "").trim();
  if (!cleaned) {
    return "?";
  }
  const parts = cleaned.split(/[\s._-]+/).filter(Boolean);
  const letters =
    parts.length > 1
      ? parts[0][0] + parts[parts.length - 1][0]
      : cleaned.slice(0, 2);
  return letters.toUpperCase();
}

/** Relative time: "just now", "4 m", "3 h", "2 d", "5 mo", "1 y" (+ " ago" when long). */
export function formatRelative(value: string | null, options?: { long?: boolean }): string {
  if (!value) {
    return "—";
  }
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) {
    return "—";
  }
  const diffMs = Date.now() - then;
  const future = diffMs < 0;
  const abs = Math.abs(diffMs);
  const minutes = Math.round(abs / 60000);
  const suffix = options?.long ? (future ? "" : " ago") : "";
  const prefix = options?.long && future ? "in " : "";

  if (minutes < 1) {
    return "just now";
  }
  const [amount, unit] =
    minutes < 60
      ? [minutes, "m"]
      : minutes < 1440
        ? [Math.round(minutes / 60), "h"]
        : minutes < 43200
          ? [Math.round(minutes / 1440), "d"]
          : minutes < 525600
            ? [Math.round(minutes / 43200), "mo"]
            : [Math.round(minutes / 525600), "y"];
  return `${prefix}${amount} ${unit}${suffix}`;
}

export function formatAbsolute(value: string | null): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/** Whole days from now until a date (negative = in the past). */
export function daysUntil(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const target = new Date(value).getTime();
  if (Number.isNaN(target)) {
    return null;
  }
  return Math.ceil((target - Date.now()) / 86_400_000);
}

export function titleCase(value: string): string {
  return value
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Sentence case for status vocab: "needs_review" -> "Needs review". */
export function humanize(value: string): string {
  const spaced = value.replace(/[_-]+/g, " ").trim().toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/* ------------------------------------------------------------ domain tones */

export function serviceTone(status: string): Tone {
  switch (status) {
    case "healthy":
      return "ok";
    case "degraded":
      return "warning";
    case "unknown":
      return "neutral";
    default:
      return "risk";
  }
}

export function monitoringTone(status: string): Tone {
  switch (status) {
    case "covered":
      return "ok";
    case "partial":
      return "warning";
    default:
      return "neutral";
  }
}

export function reviewTone(status: string): Tone {
  switch (status) {
    case "active":
      return "ok";
    case "stale":
      return "warning";
    case "delete_candidate":
      return "risk";
    default:
      return "neutral";
  }
}

export function patchTone(status: string): Tone {
  switch (status) {
    case "current":
      return "ok";
    case "behind":
      return "warning";
    default:
      return "neutral";
  }
}

export function ownershipTone(confidence: string): Tone {
  switch (confidence) {
    case "known":
      return "ok";
    case "guessed":
      return "warning";
    default:
      return "neutral";
  }
}

export function renewalTone(status: string): Tone {
  switch (status) {
    case "active":
      return "ok";
    case "scheduled":
      return "info";
    case "review_needed":
      return "warning";
    default:
      return "neutral";
  }
}

export function riskTone(level: string): Tone {
  switch (level) {
    case "high":
      return "risk";
    case "medium":
      return "warning";
    case "low":
      return "ok";
    default:
      return "neutral";
  }
}

export function agentTone(status: string): Tone {
  switch (status) {
    case "completed":
      return "ok";
    case "needs_review":
      return "warning";
    default:
      return "neutral";
  }
}

/** Days-left tone for renewal risk columns: ≤7 critical, ≤30 warning. */
export function daysLeftTone(days: number | null): Tone {
  if (days === null) {
    return "neutral";
  }
  if (days <= 7) {
    return "risk";
  }
  if (days <= 30) {
    return "warning";
  }
  return "ok";
}

export const toneRank: Record<Tone, number> = {
  risk: 0,
  warning: 1,
  info: 2,
  ok: 3,
  neutral: 4,
};

/* -------------------------------------------------------------- preferences */

export function getTheme(): "light" | "dark" {
  if (typeof document === "undefined") {
    return "light";
  }
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "dark" || attr === "light") {
    return attr;
  }
  return "light";
}

export function setTheme(theme: "light" | "dark"): void {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", theme);
  }
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* storage unavailable — theme still applies for this session */
  }
}

export function getDensity(): Density {
  try {
    const stored = localStorage.getItem(DENSITY_KEY);
    if (stored === "compact" || stored === "default" || stored === "relaxed") {
      return stored;
    }
  } catch {
    /* ignore */
  }
  // Density defaults to relaxed on touch, per the design's accessibility rules.
  if (typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches) {
    return "relaxed";
  }
  return "default";
}

export function setDensity(density: Density): void {
  try {
    localStorage.setItem(DENSITY_KEY, density);
  } catch {
    /* ignore */
  }
}

export const rowHeight: Record<Density, number> = {
  compact: 30,
  default: 36,
  relaxed: 44,
};
