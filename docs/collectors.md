# Collector Framework

Collectors sync external systems into local inventory storage. They should run
in the background and write to the local database; normal UI/API page rendering
must read local state instead of proxying external systems live.

The first framework layer provides:

- `Collector` protocol with `name`, `interval_seconds`, and `collect()`
- `CollectorContext` with run metadata, optional config, and optional DB session
- `CollectorResult` with status, record counts, timing, and metadata
- `CollectorRegistry` for duplicate-safe registration and run-once execution
- APScheduler wiring for interval jobs
- Python entry-point based collector plugin discovery
- Local `pipelines` and `collector_runs` persistence for collected CI/CD state
  and collector observability

No real external collector is enabled by default. The core app must stay useful
for companies that do not use a specific tool such as Jenkins, GitHub Actions,
Jira, or vSphere.

## Plugin Model

Collector plugins are optional Python packages. They expose entry points in the
`spaghetti_desk.collectors` group and are registered only when installed in the
backend environment.

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
      base_url: ${JENKINS_URL}
      username_env: JENKINS_USERNAME
      token_env: JENKINS_TOKEN
      job_include_patterns:
        - "platform-*"
      default_owner_team: Platform
```

The public `config/config.example.yaml` keeps Jenkins disabled and uses
`jenkins.example.invalid`. Real Jenkins URLs, usernames, tokens, job patterns,
and team mappings belong in private deployment config outside this repository.

When enabled, the Jenkins collector reads Jenkins job metadata and writes
normalized `pipeline` records to the local database. Normal dashboard/API reads
should query the local database rather than Jenkins.
