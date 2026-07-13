# Private Configuration

Spaghetti Desk keeps public defaults, private connection settings, secrets,
and collected inventory in separate places.

| Information | Location |
| --- | --- |
| Public-safe defaults and examples | `config/config.example.yaml` |
| Private URLs, filters, schedules, and mappings | `~/.config/spaghetti-desk/config.yaml`, an explicit private YAML file, or the Docker-mounted `config/local.yaml` |
| Usernames, tokens, and passwords | Environment variables loaded from an ignored `.env` or a secret manager |
| Collected pipelines and future inventory | PostgreSQL |

Do not put collected inventory or credential values in YAML. YAML explains how
to connect; environment variables supply secrets; PostgreSQL stores what a
collector discovered.

## How Configuration Is Loaded

The backend always loads `config/config.example.yaml` first, then selects a
private override in this order:

1. The file explicitly named by `SPAGHETTI_CONFIG_PATH`.
2. The user config file at `~/.config/spaghetti-desk/config.yaml` when present.
3. No private override; public defaults remain active.

`XDG_CONFIG_HOME` is honored on Unix-like systems. On Windows, the application
data directory is used. The selected private file is deeply merged over the
public defaults, so it only needs to contain settings that differ.

Configuration is validated and cached at backend startup. Restart the backend
after changing YAML or environment variables. Missing files, invalid YAML,
incorrect collector types, invalid intervals, and unsupported environment
references fail startup with a focused error.

YAML values are not shell-expanded. Do not write `${JENKINS_URL}` in the YAML
file. Write the real non-secret URL directly in the private YAML. For secrets,
configure the names of environment variables with settings such as
`username_env` and `token_env`; put their values only in the environment.

## Local Development With Private Settings

For a backend running directly on your computer, create the user config once:

```bash
mkdir -p ~/.config/spaghetti-desk
cp config/private.example.yaml ~/.config/spaghetti-desk/config.yaml
```

Edit that `config.yaml`; no environment variable is required. You can still set
`SPAGHETTI_CONFIG_PATH` when you need to select a different file explicitly.

Docker containers cannot automatically read files from the host home directory.
For Docker Compose development, use the repository's ignored local copy and
mount it into the container:

The repository contains public-safe templates. Create ignored local copies:

```bash
cp config/private.example.yaml config/local.yaml
cp .env.example .env
```

Edit `config/local.yaml` locally. For an initial Jenkins connectivity check:

```yaml
collectors:
  enabled: true
  write_to_local_inventory: false
  plugins:
    jenkins:
      enabled: true
      base_url: https://jenkins.example.invalid
      username_env: JENKINS_USERNAME
      token_env: JENKINS_TOKEN
```

Replace the example URL in the ignored file, then set the credential values in
the ignored `.env`:

```dotenv
JENKINS_USERNAME=replace-locally
JENKINS_TOKEN=replace-locally
```

Start the development stack with the public-safe Compose override:

```bash
docker compose \
  --env-file .env \
  --file docker-compose.yml \
  --file docker-compose.private.example.yml \
  up --build
```

The development backend image includes the Jenkins plugin. The override selects
`/app/config/local.yaml` and passes the named credential variables to the
backend without putting their values in Compose YAML.

With `write_to_local_inventory: false`, the collector can contact Jenkins and
report what it saw, but it does not write pipeline rows. After verifying the
connection and filters, set it to `true` and restart the backend to populate the
Pipeline Catalog.

`config/local.yaml` and `.env` are ignored by Git. Check `git status` before
every commit. Never force-add either file.

## Private Deployment Directory

For a long-lived company deployment, keep the release Compose file, private
override, private configuration, and `.env` in a separate private deployment
directory or private repository. Mount the private YAML read-only into the
application container and set `SPAGHETTI_CONFIG_PATH` to its container path.

The public Spaghetti Desk repository should contain only application code,
public-safe templates, tests, and fake data. Real endpoints, identities,
credentials, mappings, and exported inventory must stay in the private
deployment layer.
