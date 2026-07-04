# Spaghetti Desk

Spaghetti Desk is an open-source DevOps Control Center for service inventory,
VM ownership, CI/CD visibility, license tracking, permission visibility, agent
session history, and audited operations.

The goal is to give DevOps operators one fast place to answer operational
questions without turning the portal into a slow live proxy for every tool in
the stack.

## What It Tracks

- DevOps services and where they run
- VM ownership, purpose, freshness, and review status
- License, certificate, token, and support expiry dates
- Pipeline relationships across repositories, CI jobs, artifacts, and targets
- User and permission state across systems
- Monitoring summary signals
- Agent sessions and automation outcomes
- Audited action requests and script results

## Component-Wise Modules

Spaghetti Desk is built as a component-wise app. Deployments can enable only the
modules they need and choose which widgets appear on the overview. The first
module registry lives in `frontend/src/moduleConfig.ts`; see
`docs/modules.md`.

## Architecture

```text
Browser UI
  |
Backend API
  |
PostgreSQL Inventory DB
  |
Collectors + Script/Action Runner
  |
External DevOps systems
```

Performance is a first-class design constraint:

- UI pages should read from local API/database state.
- Collectors should sync external systems in the background.
- API list endpoints should support pagination and filtering from the start.
- Expensive external calls should not happen during normal page rendering.
- Mutating operations should be explicit, validated, audited, and safe to review.

## Current Status

This repository is in the initial bootstrap phase. It contains:

- A FastAPI backend skeleton with public-safe demo data
- A React and TypeScript frontend skeleton
- Docker Compose local runtime scaffolding
- Example configuration
- Tests and CI skeleton
- Public/private data separation rules

## Quick Start

The project is designed to run through Docker Compose once dependencies are
available:

```bash
docker compose up --build
```

Local development entry points:

- Backend API: `http://localhost:8000`
- API docs: `http://localhost:8000/docs`
- Frontend: `http://localhost:5173`
- PostgreSQL: `localhost:5432`

Backend-only development:

```bash
cd backend
uv sync --all-extras --dev
uv run pytest
uv run uvicorn app.main:app --reload
```

Frontend-only development:

```bash
cd frontend
npm install
npm run dev
```

## Data Safety

This is intended to be a public GitHub project. Do not commit real company
data. The repository should only contain fake, example, or demo data.

Safe public examples:

- `.env.example`
- `config/config.example.yaml`
- `examples/demo-data/`
- `docs/`
- `docker-compose.yml`
- `.github/workflows/`

Private data must stay out of this repository:

- `.env`
- `config/local.yaml`
- `data/private/`
- `secrets/`
- `runtime/`
- `agent-sessions/` if sessions contain internal data
- Real hostnames, URLs, IPs, usernames, emails, license data, or exports

## Roadmap

1. Project bootstrap and public-safe demo data
2. Inventory model and API persistence
3. Service catalog
4. VM ownership catalog
5. License and expiry center
6. Agent session log
7. Permission and audit log
8. Dashboard UI
9. Background collectors
10. Controlled action runner
11. GitHub Actions CI and release workflow

## License

MIT

## Versioning and Releases

Spaghetti Desk uses Conventional Commits and Semantic Versioning. Release Please
maintains `CHANGELOG.md`, opens release pull requests, creates GitHub releases,
and tags releases as `vX.Y.Z`.

Tag pushes also run the release workflow, which builds backend Python
distributions with `uv build` and packages the frontend production bundle.
