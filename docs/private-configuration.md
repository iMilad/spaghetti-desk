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

Run the installer from the repository root:

```bash
scripts/install-local.py
```

The installer:

- Creates the platform user configuration directory when it is missing.
- Copies the public-safe template to `config.yaml` only when that file does not
  already exist.
- Applies owner-only permissions on Unix and macOS.
- Creates or updates `compose.env` with the absolute host path Docker must
  mount, while preserving any other values already in that file.

On Unix and macOS the default directory is
`~/.config/spaghetti-desk`. `XDG_CONFIG_HOME` is respected. Windows uses
`%APPDATA%\SpaghettiDesk`.

Edit the generated `config.yaml`, then use the exact start command printed by
the installer. On Unix and macOS, the default command is:

```bash
docker compose \
  --env-file ~/.config/spaghetti-desk/compose.env \
  up --build
```

Compose mounts the selected host file read-only at `/app/config/config.yaml` in
the backend and sets `SPAGHETTI_CONFIG_PATH` to that container path. Docker never
needs direct access to the rest of the home configuration directory.

You can still set `SPAGHETTI_CONFIG_PATH` when running the backend directly and
need to select a different file explicitly.

For an initial Jenkins connectivity check, edit the generated `config.yaml`:

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

Replace the example URL in the private file, then add the credential values to
the generated private `compose.env`:

```dotenv
JENKINS_USERNAME=replace-locally
JENKINS_TOKEN=replace-locally
```

Start the development stack with the generated Docker settings:

```bash
docker compose \
  --env-file ~/.config/spaghetti-desk/compose.env \
  up --build
```

The development backend image includes the Jenkins plugin. Compose passes the
named credential variables without putting their values in tracked Compose
YAML.

With `write_to_local_inventory: false`, the collector can contact Jenkins and
report what it saw, but it does not write pipeline rows. After verifying the
connection and filters, set it to `true` and restart the backend to populate the
Pipeline Catalog.

The normal installer keeps both private files outside the repository. The
legacy `config/local.yaml` and `.env` workflow remains ignored by Git. Check
`git status` before every commit and never force-add private files.

## Private Deployment Directory

For a long-lived company deployment, keep the release Compose file, private
override, private configuration, and `.env` in a separate private deployment
directory or private repository. Mount the private YAML read-only into the
application container and set `SPAGHETTI_CONFIG_PATH` to its container path.

The public Spaghetti Desk repository should contain only application code,
public-safe templates, tests, and fake data. Real endpoints, identities,
credentials, mappings, and exported inventory must stay in the private
deployment layer.
