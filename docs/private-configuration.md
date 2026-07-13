# Private Configuration

Spaghetti Desk keeps public defaults, private connection settings, secrets,
and collected inventory in separate places.

| Information | Location |
| --- | --- |
| Public-safe defaults and examples | `config/config.example.yaml` |
| Private URLs, filters, schedules, and mappings | Settings UI, backed by `~/.config/spaghetti-desk/config.yaml` |
| Usernames, tokens, and passwords | Masked Settings fields, backed by private `compose.env` until a secret-manager backend is available |
| Collected pipelines and future inventory | PostgreSQL |

Users normally configure the installation from the Settings page. Do not put
collected inventory or credential values in YAML. YAML stores non-secret
connection settings; the private environment file supplies secrets; PostgreSQL
stores what a collector discovered and the audited settings-change history.

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
- Creates `compose.env` for private credentials while preserving existing
  values.
- Generates `docker-compose.user.yml`, which mounts only the private Spaghetti
  Desk configuration directory as writable inside the backend.

On Unix and macOS the default directory is
`~/.config/spaghetti-desk`. `XDG_CONFIG_HOME` is respected. Windows uses
`%APPDATA%\SpaghettiDesk`.

Use the exact start command printed by the installer. On Unix and macOS, the
default command is:

```bash
docker compose \
  --env-file ~/.config/spaghetti-desk/compose.env \
  --file docker-compose.yml \
  --file ~/.config/spaghetti-desk/docker-compose.user.yml \
  up --build
```

Compose mounts only the generated Spaghetti Desk directory at
`/app/user-config`. The backend is allowed to update `config.yaml` and
`compose.env` there; it cannot browse or modify the rest of the home
configuration directory.

You can still set `SPAGHETTI_CONFIG_PATH` when running the backend directly and
need to select a different file explicitly.

Open **Settings → Jenkins integration**. Enter the URL and credentials, keep
**Write to local inventory** off, and choose **Test connection**. Saving updates
non-secret YAML and credentials separately, reloads the collector runtime when
possible, and creates a sanitized audit record without returning secret values
to the browser.

With inventory writing off, the collector can contact Jenkins and report what
it saw without writing pipeline rows. After a successful connection test,
enable inventory writing to populate the Pipeline Catalog.

The normal installer keeps all private files outside the repository. The
legacy `config/local.yaml` and `.env` workflow remains ignored by Git. Check
`git status` before every commit and never force-add private files.

## Private Deployment Directory

For a long-lived company deployment, keep the release Compose file, private
override, private configuration, and secret backend in a separate private
deployment directory or private repository. A deployment that enables the
Settings writer must expose only its dedicated configuration directory and set
`SPAGHETTI_CONFIG_WRITABLE=true`; otherwise keep configuration read-only.

The public Spaghetti Desk repository should contain only application code,
public-safe templates, tests, and fake data. Real endpoints, identities,
credentials, mappings, and exported inventory must stay in the private
deployment layer.
