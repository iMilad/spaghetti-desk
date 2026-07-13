import {
  CheckCircle2,
  Eye,
  EyeOff,
  LoaderCircle,
  PlugZap,
  Save,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import {
  fetchManagedSettings,
  saveManagedSettings,
  testJenkinsConnection,
} from "./api";
import type { AppConfig } from "./moduleConfig";
import type {
  CurrentOperator,
  ManagedSettings,
  SettingsUpdate,
} from "./types";
import { getDensity, setDensity } from "./ui";
import type { Density } from "./ui";

type SettingsForm = SettingsUpdate & {
  patterns_text: string;
  stored_username: boolean;
  stored_token: boolean;
};

type Feedback = { tone: "ok" | "risk" | "info"; message: string } | null;

export function SettingsPage({
  appConfig,
  theme,
  onToggleTheme,
  onOperatorChanged,
  onSettingsSaved,
}: {
  appConfig: AppConfig;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onOperatorChanged: (operator: CurrentOperator) => void;
  onSettingsSaved?: () => void;
}) {
  const [settings, setSettings] = useState<ManagedSettings | null>(null);
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [density, setDensityValue] = useState<Density>(() => getDensity());

  useEffect(() => {
    let active = true;
    setLoading(true);
    void fetchManagedSettings()
      .then((loaded) => {
        if (!active) return;
        setSettings(loaded);
        setForm(formFromSettings(loaded));
        setFeedback(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setFeedback({ tone: "risk", message: errorMessage(error) });
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const validation = useMemo(() => validateForm(form), [form]);
  const canSave = Boolean(settings?.storage.writable && form && validation.length === 0);

  const update = (recipe: (current: SettingsForm) => SettingsForm) => {
    setForm((current) => (current ? recipe(current) : current));
    setFeedback(null);
  };

  const save = async () => {
    if (!form || !canSave || saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      const response = await saveManagedSettings(payloadFromForm(form));
      setSettings(response.settings);
      setForm(formFromSettings(response.settings));
      setFeedback({ tone: "ok", message: response.message });
      onOperatorChanged({
        id: response.settings.operator.id,
        displayName: response.settings.operator.display_name,
        role: response.settings.operator.role,
        source: "config",
      });
      onSettingsSaved?.();
    } catch (error) {
      setFeedback({ tone: "risk", message: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    if (!form || testing) return;
    setTesting(true);
    setFeedback(null);
    try {
      const result = await testJenkinsConnection({
        base_url: form.jenkins.base_url,
        timeout_seconds: form.jenkins.timeout_seconds,
        verify_tls: form.jenkins.verify_tls,
        ...(form.jenkins.username ? { username: form.jenkins.username } : {}),
        ...(form.jenkins.token ? { token: form.jenkins.token } : {}),
      });
      setFeedback({
        tone: result.success ? "ok" : "risk",
        message: result.message,
      });
    } catch (error) {
      setFeedback({ tone: "risk", message: errorMessage(error) });
    } finally {
      setTesting(false);
    }
  };

  const chooseDensity = (value: Density) => {
    setDensity(value);
    setDensityValue(value);
  };

  if (loading) {
    return <SettingsLoading />;
  }

  if (!settings || !form) {
    return (
      <section className="page settings-page" aria-label="Settings">
        <div className="page-head">
          <h1 className="page-head__title">Settings</h1>
        </div>
        <FeedbackStrip feedback={feedback} />
      </section>
    );
  }

  const writable = settings.storage.writable;
  const modules = Object.values(appConfig.modules);

  return (
    <section className="page settings-page" aria-label="Settings">
      <header className="settings-hero">
        <div>
          <p className="eyebrow">Local administration</p>
          <h1 className="page-head__title">Settings</h1>
          <p className="settings-hero__copy">
            Configure this installation without editing YAML or environment files.
          </p>
        </div>
        <div className="settings-hero__actions">
          <button
            type="button"
            className="btn btn--primary settings-action"
            disabled={!canSave || saving}
            onClick={() => void save()}
          >
            {saving ? <LoaderCircle className="spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
      </header>

      {!writable ? (
        <div className="settings-notice settings-notice--warning" role="status">
          <TriangleAlert aria-hidden="true" />
          <div>
            <strong>Saving is not enabled for this installation</strong>
            <p>{settings.storage.message}</p>
          </div>
        </div>
      ) : (
        <div className="settings-notice settings-notice--ok" role="status">
          <ShieldCheck aria-hidden="true" />
          <div>
            <strong>Private configuration is writable</strong>
            <p>Changes are validated, written atomically, and recorded in the audit log.</p>
          </div>
        </div>
      )}

      <FeedbackStrip feedback={feedback} />

      {validation.length > 0 ? (
        <div className="settings-validation" role="alert">
          <strong>Review these fields before saving:</strong>
          <ul>{validation.map((message) => <li key={message}>{message}</li>)}</ul>
        </div>
      ) : null}

      <div className="settings-layout">
        <div className="settings-main">
          <SettingsCard
            title="Operator identity"
            description="This identity appears in audits and controlled operations."
          >
            <div className="settings-grid settings-grid--3">
              <Field label="Operator ID" hint="Stable ID; letters, numbers, dot, dash, colon, or @.">
                <input
                  value={form.operator.id}
                  disabled={!writable}
                  onChange={(event) =>
                    update((current) => ({
                      ...current,
                      operator: { ...current.operator, id: event.target.value },
                    }))
                  }
                />
              </Field>
              <Field label="Display name" hint="Shown in the sidebar and audit history.">
                <input
                  value={form.operator.display_name}
                  disabled={!writable}
                  onChange={(event) =>
                    update((current) => ({
                      ...current,
                      operator: { ...current.operator, display_name: event.target.value },
                    }))
                  }
                />
              </Field>
              <Field label="Role" hint="Use admin for the current single-user installation.">
                <select
                  value={form.operator.role}
                  disabled={!writable}
                  onChange={(event) =>
                    update((current) => ({
                      ...current,
                      operator: { ...current.operator, role: event.target.value },
                    }))
                  }
                >
                  <option value="admin">Admin</option>
                  <option value="operator">DevOps operator</option>
                  <option value="auditor">Auditor</option>
                  <option value="viewer">Viewer</option>
                </select>
              </Field>
            </div>
          </SettingsCard>

          <SettingsCard
            title="Jenkins integration"
            description="Test access first, then decide when collected pipelines may be written locally."
            badge={form.jenkins.enabled ? "Enabled" : "Disabled"}
          >
            <div className="settings-toggle-row">
              <Toggle
                label="Enable all collectors"
                description="Starts the collector scheduler for enabled integrations."
                checked={form.collectors_enabled}
                disabled={!writable}
                onChange={(checked) =>
                  update((current) => ({ ...current, collectors_enabled: checked }))
                }
              />
              <Toggle
                label="Enable Jenkins"
                description="Allows the Jenkins plugin to run on its schedule."
                checked={form.jenkins.enabled}
                disabled={!writable}
                onChange={(checked) =>
                  update((current) => ({
                    ...current,
                    jenkins: { ...current.jenkins, enabled: checked },
                  }))
                }
              />
              <Toggle
                label="Write to local inventory"
                description="Keep off until the connection test succeeds."
                checked={form.write_to_local_inventory}
                disabled={!writable}
                onChange={(checked) =>
                  update((current) => ({ ...current, write_to_local_inventory: checked }))
                }
              />
            </div>

            <div className="settings-grid settings-grid--2">
              <Field label="Jenkins URL" hint="Base URL only; do not add /api/json.">
                <input
                  type="url"
                  placeholder="https://jenkins.company.example"
                  value={form.jenkins.base_url}
                  disabled={!writable}
                  onChange={(event) =>
                    update((current) => ({
                      ...current,
                      jenkins: { ...current.jenkins, base_url: event.target.value },
                    }))
                  }
                />
              </Field>
              <Field label="Default owner team" hint="Applied when Jenkins has no ownership metadata.">
                <input
                  value={form.jenkins.default_owner_team}
                  disabled={!writable}
                  onChange={(event) =>
                    update((current) => ({
                      ...current,
                      jenkins: { ...current.jenkins, default_owner_team: event.target.value },
                    }))
                  }
                />
              </Field>
              <Field label="Collection interval" hint="Seconds between runs; minimum 10.">
                <input
                  type="number"
                  min={10}
                  max={86400}
                  value={form.jenkins.interval_seconds}
                  disabled={!writable}
                  onChange={(event) =>
                    update((current) => ({
                      ...current,
                      jenkins: {
                        ...current.jenkins,
                        interval_seconds: Number(event.target.value),
                      },
                    }))
                  }
                />
              </Field>
              <Field label="Connection timeout" hint="Seconds to wait before reporting a failed connection.">
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={form.jenkins.timeout_seconds}
                  disabled={!writable}
                  onChange={(event) =>
                    update((current) => ({
                      ...current,
                      jenkins: {
                        ...current.jenkins,
                        timeout_seconds: Number(event.target.value),
                      },
                    }))
                  }
                />
              </Field>
              <Field
                label="Job filters"
                hint="One case-sensitive wildcard per line. Leave empty to include every job."
                wide
              >
                <textarea
                  rows={3}
                  placeholder={"platform-*\nbackend-*"}
                  value={form.patterns_text}
                  disabled={!writable}
                  onChange={(event) =>
                    update((current) => ({ ...current, patterns_text: event.target.value }))
                  }
                />
              </Field>
            </div>

            <div className="settings-credentials">
              <div className="settings-credentials__head">
                <div>
                  <h3>Credentials</h3>
                  <p>Leave blank to keep the currently stored value.</p>
                </div>
                <button
                  type="button"
                  className="btn btn--strong settings-control"
                  onClick={() => setShowCredentials((current) => !current)}
                >
                  {showCredentials ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                  {showCredentials ? "Hide" : "Show"}
                </button>
              </div>
              <div className="settings-grid settings-grid--2">
                <Field
                  label="Jenkins username"
                  hint={form.stored_username ? "A username is already stored." : "No username stored yet."}
                >
                  <input
                    type={showCredentials ? "text" : "password"}
                    autoComplete="username"
                    value={form.jenkins.username ?? ""}
                    disabled={!writable || form.jenkins.clear_credentials}
                    onChange={(event) =>
                      update((current) => ({
                        ...current,
                        jenkins: { ...current.jenkins, username: event.target.value },
                      }))
                    }
                  />
                </Field>
                <Field
                  label="Jenkins API token"
                  hint={form.stored_token ? "A token is already stored." : "No token stored yet."}
                >
                  <input
                    type={showCredentials ? "text" : "password"}
                    autoComplete="new-password"
                    value={form.jenkins.token ?? ""}
                    disabled={!writable || form.jenkins.clear_credentials}
                    onChange={(event) =>
                      update((current) => ({
                        ...current,
                        jenkins: { ...current.jenkins, token: event.target.value },
                      }))
                    }
                  />
                </Field>
              </div>
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={form.jenkins.clear_credentials ?? false}
                  disabled={!writable}
                  onChange={(event) =>
                    update((current) => ({
                      ...current,
                      jenkins: {
                        ...current.jenkins,
                        clear_credentials: event.target.checked,
                        username: "",
                        token: "",
                      },
                    }))
                  }
                />
                Remove stored Jenkins credentials when saving
              </label>
            </div>

            <div className="settings-inline-actions">
              <button
                type="button"
                className="btn btn--strong settings-action"
                disabled={testing || !writable || !form.jenkins.base_url}
                onClick={() => void testConnection()}
              >
                {testing ? <LoaderCircle className="spin" aria-hidden="true" /> : <PlugZap aria-hidden="true" />}
                {testing ? "Testing…" : "Test connection"}
              </button>
              <Toggle
                compact
                label="Verify TLS certificate"
                description="Recommended. Disable only for a trusted internal certificate."
                checked={form.jenkins.verify_tls}
                disabled={!writable}
                onChange={(checked) =>
                  update((current) => ({
                    ...current,
                    jenkins: { ...current.jenkins, verify_tls: checked },
                  }))
                }
              />
            </div>
          </SettingsCard>

          <SettingsCard
            title="Action safety"
            description="These defaults prepare controlled operations; external action execution is not enabled yet."
          >
            <div className="settings-toggle-row">
              <Toggle
                label="Enable actions"
                description="Reserved for the controlled action runner."
                checked={form.actions.enabled}
                disabled={!writable}
                onChange={(checked) =>
                  update((current) => ({
                    ...current,
                    actions: { ...current.actions, enabled: checked },
                  }))
                }
              />
              <Toggle
                label="Require approval by default"
                description="Recommended for every future modifying operation."
                checked={form.actions.require_approval_by_default}
                disabled={!writable}
                onChange={(checked) =>
                  update((current) => ({
                    ...current,
                    actions: { ...current.actions, require_approval_by_default: checked },
                  }))
                }
              />
              <Toggle
                label="Audit all attempts"
                description="Record successful, rejected, and failed attempts."
                checked={form.actions.audit_all_attempts}
                disabled={!writable}
                onChange={(checked) =>
                  update((current) => ({
                    ...current,
                    actions: { ...current.actions, audit_all_attempts: checked },
                  }))
                }
              />
            </div>
          </SettingsCard>
        </div>

        <aside className="settings-side" aria-label="Local preferences and status">
          <SettingsCard title="Appearance" description="Saved in this browser only.">
            <div className="settings-choice-group">
              <span>Theme</span>
              <div className="settings-segmented">
                {(["light", "dark"] as const).map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={theme === value ? "is-active" : ""}
                    onClick={() => theme !== value && onToggleTheme()}
                  >
                    {capitalize(value)}
                  </button>
                ))}
              </div>
            </div>
            <div className="settings-choice-group">
              <span>Table density</span>
              <div className="settings-segmented settings-segmented--stack">
                {(["compact", "default", "relaxed"] as Density[]).map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={density === value ? "is-active" : ""}
                    onClick={() => chooseDensity(value)}
                  >
                    {capitalize(value)}
                  </button>
                ))}
              </div>
            </div>
          </SettingsCard>

          <SettingsCard title="Enabled modules">
            <dl className="settings-module-list">
              {modules.map((module) => (
                <div key={module.id}>
                  <dt>{module.label}</dt>
                  <dd>{module.enabled ? "Enabled" : "Disabled"}</dd>
                </div>
              ))}
            </dl>
          </SettingsCard>
        </aside>
      </div>
    </section>
  );
}

function SettingsCard({
  title,
  description,
  badge,
  children,
}: {
  title: string;
  description?: string;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <article className="card settings-card">
      <div className="settings-card__head">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {badge ? <span className="settings-badge">{badge}</span> : null}
      </div>
      <div className="settings-card__body">{children}</div>
    </article>
  );
}

function Field({
  label,
  hint,
  wide = false,
  children,
}: {
  label: string;
  hint: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={`settings-field ${wide ? "settings-field--wide" : ""}`}>
      <span>{label}</span>
      {children}
      <small>{hint}</small>
    </label>
  );
}

function Toggle({
  label,
  description,
  checked,
  disabled,
  compact = false,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  compact?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`settings-toggle ${compact ? "settings-toggle--compact" : ""}`}>
      <span className="settings-toggle__copy">
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="settings-toggle__track" aria-hidden="true" />
    </label>
  );
}

function FeedbackStrip({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return (
    <div className={`settings-feedback settings-feedback--${feedback.tone}`} role="status" aria-live="polite">
      {feedback.tone === "ok" ? <CheckCircle2 aria-hidden="true" /> : <TriangleAlert aria-hidden="true" />}
      <span>{feedback.message}</span>
    </div>
  );
}

function SettingsLoading() {
  return (
    <section className="page settings-page" aria-label="Loading settings" aria-busy="true">
      <div className="settings-hero">
        <div>
          <span className="skeleton" style={{ width: 88, height: 10 }} />
          <span className="skeleton" style={{ width: 180, height: 24, marginTop: 10 }} />
        </div>
      </div>
      <div className="settings-layout" aria-hidden="true">
        <div className="settings-main">
          {[1, 2, 3].map((item) => <div className="card settings-loading-card" key={item} />)}
        </div>
      </div>
    </section>
  );
}

function formFromSettings(settings: ManagedSettings): SettingsForm {
  return {
    operator: { ...settings.operator },
    collectors_enabled: settings.collectors_enabled,
    write_to_local_inventory: settings.write_to_local_inventory,
    jenkins: {
      enabled: settings.jenkins.enabled,
      interval_seconds: settings.jenkins.interval_seconds,
      base_url: settings.jenkins.base_url,
      job_include_patterns: [...settings.jenkins.job_include_patterns],
      default_owner_team: settings.jenkins.default_owner_team,
      timeout_seconds: settings.jenkins.timeout_seconds,
      verify_tls: settings.jenkins.verify_tls,
      username: "",
      token: "",
      clear_credentials: false,
    },
    actions: { ...settings.actions },
    patterns_text: settings.jenkins.job_include_patterns.join("\n"),
    stored_username: settings.jenkins.username_configured,
    stored_token: settings.jenkins.token_configured,
  };
}

function payloadFromForm(form: SettingsForm): SettingsUpdate {
  const username = form.jenkins.username?.trim();
  const token = form.jenkins.token;
  return {
    operator: {
      id: form.operator.id.trim(),
      display_name: form.operator.display_name.trim(),
      role: form.operator.role,
    },
    collectors_enabled: form.collectors_enabled,
    write_to_local_inventory: form.write_to_local_inventory,
    jenkins: {
      enabled: form.jenkins.enabled,
      interval_seconds: form.jenkins.interval_seconds,
      base_url: form.jenkins.base_url.trim(),
      job_include_patterns: form.patterns_text.split("\n").map((value) => value.trim()).filter(Boolean),
      default_owner_team: form.jenkins.default_owner_team.trim(),
      timeout_seconds: form.jenkins.timeout_seconds,
      verify_tls: form.jenkins.verify_tls,
      ...(username ? { username } : {}),
      ...(token ? { token } : {}),
      ...(form.jenkins.clear_credentials ? { clear_credentials: true } : {}),
    },
    actions: { ...form.actions },
  };
}

function validateForm(form: SettingsForm | null): string[] {
  if (!form) return [];
  const messages: string[] = [];
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:@-]*$/.test(form.operator.id.trim())) {
    messages.push("Operator ID contains unsupported characters.");
  }
  if (!form.operator.display_name.trim()) messages.push("Display name is required.");
  if (form.jenkins.enabled) {
    if (!/^https?:\/\//.test(form.jenkins.base_url.trim())) {
      messages.push("Jenkins URL must start with http:// or https://.");
    }
    const hasUsername = form.stored_username || Boolean(form.jenkins.username?.trim());
    const hasToken = form.stored_token || Boolean(form.jenkins.token);
    if (form.jenkins.clear_credentials) {
      messages.push("Disable Jenkins before removing its stored credentials.");
    } else if (!hasUsername || !hasToken) {
      messages.push("Jenkins username and API token are required when Jenkins is enabled.");
    }
  }
  if (form.write_to_local_inventory && !form.collectors_enabled) {
    messages.push("Enable collectors before allowing inventory writes.");
  }
  if (form.jenkins.enabled && !form.collectors_enabled) {
    messages.push("Enable all collectors before enabling Jenkins.");
  }
  return messages;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The settings request failed.";
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
