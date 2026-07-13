# Collector Framework

Collectors sync external systems into local inventory storage. They should run
in the background and write to the local database; normal UI/API page rendering
must read local state instead of proxying external systems live.

The first framework layer provides:

- `Collector` protocol with `name`, `interval_seconds`, and `collect()`
- Collector plugin status reporting for installed, enabled, configured, and
  last-run state
- `CollectorContext` with run metadata, optional config, and optional DB session
- `CollectorResult` with status, record counts, timing, and metadata
- `CollectorRegistry` for duplicate-safe registration and run-once execution
- APScheduler wiring for interval jobs
- Python entry-point based collector plugin discovery
- Local `pipelines` and `collector_runs` persistence for collected CI/CD state
  and collector observability
- FastAPI startup wiring that builds the collector registry from runtime config
  and starts the background scheduler only when `collectors.enabled: true`

No real external collector is enabled by default. The core app must stay useful
for companies that do not use a specific tool such as Jenkins, GitHub Actions,
Jira, or vSphere.

## Plugin Model

Collector plugins are optional Python packages. They expose entry points in the
`spaghetti_desk.collectors` group and are registered only when installed in the
backend environment. See [Install and Configure a Collector](collector-plugin-template.md)
for a generic non-Jenkins plugin template, or run:

```bash
scripts/scaffold-collector example-ci
```

Core responsibilities:

- Define canonical local read models and APIs.
- Discover installed collector plugins.
- Load collector config from private deployment config.
- Schedule enabled collectors.
- Record collector run history.

Plugin responsibilities:

- Connect to one external system.
- Handle that system's pagination, auth, timeouts, and rate limits.
- Normalize external records into local Spaghetti Desk models.
- Upsert local database records idempotently.
- Optionally expose `is_configured(config)` so the registry can show whether
  required private settings are present without contacting the external system.

## Plugin Registry

`GET /api/v1/collectors` returns the deployment's plugin registry. Each row
reports:

- whether the collector package is installed
- whether scheduling is enabled by global and plugin config
- whether plugin-specific configuration is complete
- the latest local collector run, when one exists

The frontend Collectors page renders those fields in one registry table and
keeps recent run history below it for audit context. Missing persistence tables
do not break the registry; last run is shown as empty until the local database
is initialized.

## Jenkins Plugin

The repository includes an optional Jenkins plugin package in
`plugins/jenkins`. Install it only when the deployment uses Jenkins:

```bash
cd backend
uv pip install -e ../plugins/jenkins
```

Then enable it in private config:

```yaml
collectors:
  enabled: true
  plugins:
    jenkins:
      enabled: true
      interval_seconds: 300
      base_url: https://jenkins.example.invalid
      username_env: JENKINS_USERNAME
      token_env: JENKINS_TOKEN
      job_include_patterns:
        - "platform-*"
      default_owner_team: Platform
```

Replace the example URL directly in private YAML. YAML values are not expanded,
so `${JENKINS_URL}` is not supported. `username_env` and `token_env` contain the
names of environment variables; the corresponding credential values belong in
the backend process environment, never in YAML.

The public `config/config.example.yaml` keeps Jenkins disabled and uses
`jenkins.example.invalid`. Real Jenkins URLs, usernames, tokens, job patterns,
and team mappings belong in private deployment config outside this repository.

When enabled, the Jenkins collector reads Jenkins job metadata and writes
normalized `pipeline` records to the local database. Normal dashboard/API reads
should query the local database rather than Jenkins.

The frontend exposes those local records through the Pipeline Catalog module.
Deployments that do not use Jenkins can leave the Jenkins plugin uninstalled and
still use the same catalog with a different collector plugin later.

## Runtime Behavior

At API startup the backend reads merged runtime config, builds a collector
registry from installed plugin entry points, and starts the APScheduler runtime
only when the global collector switch is enabled and at least one installed
plugin is enabled. Public demo config keeps the switch off, so no scheduler is
started and no external systems are contacted by default.

Runtime configuration is validated once at startup and then cached. Restart the
backend after changing private YAML or credential environment variables.

Before starting scheduled jobs, the runtime verifies that the local collector
read-model tables exist. If the database has not been initialized, startup
fails with a migration message instead of letting collectors fail later in the
background. Run:

```bash
cd backend
uv run alembic upgrade head
```

Every scheduled collector run receives a database session and records a
`collector_runs` row with status, timing, record counts, dry-run state, message,
and metadata. The frontend Collectors page reads registry and run history from
the local API/database read model; it does not call Jenkins or any other
external tool directly.
