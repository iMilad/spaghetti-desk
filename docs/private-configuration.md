# Private Configuration

Spaghetti Desk keeps public defaults, private connection settings, secrets,
and collected inventory in separate places.

| Information | Location |
| --- | --- |
| Public-safe defaults and examples | `config/config.example.yaml` |
| Private URLs, filters, schedules, and mappings | `config/local.yaml` or an external private YAML file |
| Usernames, tokens, and passwords | Environment variables loaded from an ignored `.env` or a secret manager |
| Collected pipelines and future inventory | PostgreSQL |

Do not put collected inventory or credential values in YAML. YAML explains how
to connect; environment variables supply secrets; PostgreSQL stores what a
collector discovered.

## How Configuration Is Loaded

The backend always loads `config/config.example.yaml` first. If
`SPAGHETTI_CONFIG_PATH` points to another file, that private file is deeply
merged over the public defaults. A private file can therefore contain only the
settings that differ from the defaults.

Configuration is validated and cached at backend startup. Restart the backend
after changing YAML or environment variables. Missing files, invalid YAML,
incorrect collector types, invalid intervals, and unsupported environment
references fail startup with a focused error.

YAML values are not shell-expanded. Do not write `${JENKINS_URL}` in the YAML
file. Write the real non-secret URL directly in the private YAML. For secrets,
configure the names of environment variables with settings such as
`username_env` and `token_env`; put their values only in the environment.

## Local Development With Private Settings

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
