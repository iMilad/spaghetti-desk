# Container Releases

Spaghetti Desk keeps its frontend and backend containers separate for local
development, but publishes one combined application image for releases. The
release image contains the FastAPI backend, the compiled React frontend,
public-safe default configuration, demo data, migrations, and the included
Jenkins collector plugin.

The release Compose stack runs three services:

- `postgres` stores inventory and audit state in a named volume.
- `migrate` runs Alembic once with the same application image.
- `app` serves the frontend and API from one origin.

Only the application port is published. PostgreSQL remains on the internal
Compose network.

## Deploy a Release

Each GitHub release includes these container deployment assets:

- `spaghetti-desk-vX.Y.Z-compose.yaml`
- `spaghetti-desk-vX.Y.Z.env.example`
- `SHA256SUMS`

Download the files for the same release, verify their checksums, and create the
local environment file:

```bash
# Linux
sha256sum --check SHA256SUMS

# macOS
shasum --algorithm 256 --check SHA256SUMS

cp spaghetti-desk-vX.Y.Z.env.example .env
```

Set `POSTGRES_PASSWORD` in `.env` to a long URL-safe random value. The Compose
file rejects an empty password. Then start the release:

```bash
docker compose \
  --env-file .env \
  --file spaghetti-desk-vX.Y.Z-compose.yaml \
  up --detach
```

Open `http://localhost:8080` unless `SPAGHETTI_DESK_PORT` was changed in
`.env`. The release Compose file is pinned to the multi-platform image digest
created for that Git tag, so rerunning it does not silently move to another
image.

## Private Configuration

The release image starts with public-safe demo configuration and does not
contact external systems by default. A private deployment can mount an ignored
configuration file through a local Compose override:

```yaml
services:
  app:
    environment:
      SPAGHETTI_CONFIG_PATH: /app/config/local.yaml
    volumes:
      - ./config/local.yaml:/app/config/local.yaml:ro
```

Keep the override, real URLs, credentials, job filters, team mappings, and
collected inventory outside the public repository.

## Upgrade a Deployment

Back up the PostgreSQL volume or database before upgrading. Download the new
release Compose file and run:

```bash
docker compose \
  --env-file .env \
  --file spaghetti-desk-vX.Y.Z-compose.yaml \
  pull
docker compose \
  --env-file .env \
  --file spaghetti-desk-vX.Y.Z-compose.yaml \
  up --detach
```

The one-shot `migrate` service applies the release's Alembic migrations before
the application starts.

## Maintainer Setup

Before creating a release:

1. Create a public Docker Hub repository named `spaghetti-desk`.
2. Create a Docker Hub access token with Read/Write permission and an expiry.
3. Add the Docker Hub namespace as the GitHub repository variable
   `DOCKERHUB_USERNAME`.
4. Add the token as the GitHub repository secret `DOCKERHUB_TOKEN`.

Do not put the token in source, workflow YAML, release notes, issue comments,
or chat messages.

For a stable tag such as `v0.3.0`, the workflow publishes:

- `DOCKERHUB_USERNAME/spaghetti-desk:0.3.0`
- `DOCKERHUB_USERNAME/spaghetti-desk:0.3`
- `DOCKERHUB_USERNAME/spaghetti-desk:latest`
- `DOCKERHUB_USERNAME/spaghetti-desk:sha-<commit>`

Pre-release tags do not move `latest`. The workflow publishes Linux AMD64 and
ARM64 manifests, OCI metadata, provenance, and an SBOM. It then renders the
release Compose file with the immutable multi-platform digest and uploads all
release assets with checksums.

To publish, make sure CI is green on `main`, open **Actions**, select
**Publish Release**, choose **Run workflow**, and enter the semantic version
without a leading `v`, such as `0.3.0`. The workflow rejects non-`main` runs,
invalid versions, and existing tags. It then publishes the image, creates the
version tag and GitHub release, generates release notes, and uploads the
deployment assets.

## Local Validation

Build the same combined image locally:

```bash
docker build \
  --build-arg APP_VERSION=local \
  --tag spaghetti-desk:local \
  .
```

Render and validate the release Compose template with a local tag:

```bash
./scripts/render-release-compose.sh \
  spaghetti-desk:local \
  /tmp/spaghetti-desk-compose.yaml
POSTGRES_PASSWORD=local-demo-password \
  docker compose --file /tmp/spaghetti-desk-compose.yaml config --quiet
```
