# Spaghetti Desk Agent Instructions

Spaghetti Desk is an open-source DevOps Control Center for service inventory,
VM ownership, CI/CD visibility, license tracking, permissions visibility, and
audited operations.

## Scope and Guardrails

- Stay inside this repository unless the user explicitly changes scope.
- Treat local assistant or reference folders outside this repository as
  read-only reference material. Do not edit anything under them unless the user
  explicitly asks for those folders to be changed.
- Never inspect, list, search, scan, or read the user's home `.config`
  directory or anything beneath it. Rely on user-provided feedback and command
  output for configuration stored there.
- Do not request persistent allow rules for `sudo`, destructive AWS operations,
  deploy or destroy commands, force-pushes, or recursive deletes. Require
  explicit per-action approval for those operations instead.
- Do not push to a remote until the user provides a remote URL and explicitly
  asks to push.
- Keep personal and company information out of the repository. Use fake,
  example, or demo data only.
- Do not commit company secrets, real hostnames, IP addresses, URLs, usernames,
  emails, license data, tokens, private documentation, internal exports, or
  other company-specific data.

## Product Direction

- Build a DevOps Control Center, not only a dashboard.
- The product should be generic and GitHub-ready, not company-specific.
- The portal should answer:
  - What services are running?
  - Where are they hosted?
  - Who owns what?
  - What is unhealthy, expired, outdated, unused, or unknown?
  - What actions were taken?
  - What did automation or agents do recently?
  - What permissions exist across systems?
- Support the current single-admin use case first, but design so teams can use
  it later.
- Treat performance and permission visibility as core requirements from the
  beginning.

## Public and Private Data Separation

Public repository content may include:

- Source code
- Tests
- Fake or demo data
- Example configuration
- Documentation
- Local demo Docker Compose files
- GitHub Actions workflows
- `README.md`, `SECURITY.md`, `CONTRIBUTING.md`, and `LICENSE`

Private/local content must be ignored:

- `.env`
- `config/local.yaml`
- `data/private/`
- `secrets/`
- `runtime/`
- `agent-sessions/` if session summaries may include internal data
- Real inventory exports
- Real company hostnames, IP addresses, URLs, users, licenses, or tokens

Add secret scanning to CI when CI is introduced.

## Recommended Architecture

Use this high-level shape:

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

- The UI should mostly read from the local database.
- Collectors and background jobs should query external systems on a schedule.
- Do not query every external system live on every page load.
- Mutating operations should go through validation, approval where needed, an
  audited action request, and a script/action runner.
- Store action results in the audit log.

Suggested practical stack:

- Backend: Python FastAPI
- Frontend: React + TypeScript
- Database: PostgreSQL
- Background jobs: APScheduler first; consider Celery, RQ, or Arq later
- Runtime: Docker Compose for cross-platform local development
- Tests: pytest for backend and appropriate frontend tests for the UI
- CI/CD: GitHub Actions
- Auth: local auth first; OIDC/SAML later

## Core Domain Objects

Design these models carefully before adding deep integrations:

- Organization
- Team
- User
- Permission
- Service
- Host
- VM
- Repository
- Pipeline
- Artifact
- License
- Document
- AgentSession
- ActionLog
- Integration

## MVP Priorities

Start with a local web app using fake data that shows services, VMs, ownership,
licenses, permissions, and agent sessions, with tests and a GitHub-ready
structure.

Recommended order:

1. Project bootstrap with clean open-source structure.
2. `.gitignore`, `.env.example`, example config, and fake demo data.
3. Backend API and inventory model.
4. Service catalog.
5. VM catalog and ownership model.
6. License/expiry tracker.
7. Agent session log.
8. Permission/audit log.
9. Basic dashboard UI.
10. Tests.
11. GitHub Actions CI.
12. Professional README.

Do not start with deep real integrations. Start with the data model and
fake/demo data to avoid leaking company information.

## Functional Areas

### Service Inventory

Track DevOps services such as issue tracking, source control, CI, artifact
repositories, code quality, monitoring, logging, and VM provisioning systems.

For each service, track name, type, example URL, host or VM, owner, version,
license/support expiry, backup status, monitoring status, last maintenance,
documentation link, and known risks.

### VM Ownership

VM ownership is one of the highest-value first modules.

For each VM, track name, IP, owner, team, purpose, environment, tags, CPU, RAM,
disk, OS, creation date, last seen or last activity, patch/update status,
ownership confidence, and review status.

Useful workflows include claiming a VM, asking an owner whether a VM is still
needed, marking ownership unknown, sending a review notification, and creating a
cleanup ticket.

### User Management

Show user state across tools, even when identity sources differ. Later,
controlled scripts can support user creation, update, disable, and cleanup in
systems that need it.

### License and Expiry Center

Track product licenses, support contracts, SSL certificates, service account
expiry, API tokens, and other operational expiry dates. Support reminders at 90,
60, 30, and 7 days before expiry.

### Pipeline Catalog

Map team delivery flow from team to repository, CI job, code quality project,
artifact, and deployment target. Track common failure history and ownership
context for debugging.

### Monitoring Summary

Do not replace existing monitoring tools at first. Link to existing dashboards
and pull only summary signals such as service up/down, disk warnings, CI node
offline, high CPU/memory, log error counts, backup failure, and certificate
expiry.

### Agent Sessions

Track agent work as first-class operational data:

- Session ID
- Start and end time
- Operator
- Folder/project
- Target service or VM
- Task summary
- Status
- Files changed
- Commands/scripts run
- Approval requirements
- Final outcome
- Links to ticket, commit, logs, PR, or document updates

A simple first version can import session summary JSON files from a local folder.
A later version can use a CLI wrapper or portal task queue.

### Permission and Audit Visibility

Permissions are important from day one.

Suggested roles:

- Admin
- DevOps Operator
- Team Owner
- Viewer
- Auditor

Every action should record who did it, when it happened, the target system,
target resource, action or script name, sanitized input parameters, result
status, and before/after state when possible.

Permission visibility should show who has access to what, which systems each
user exists in, admin users, stale users, service accounts, last login if
available, permission drift between tools, and risky permissions.

### Documentation Generator

Avoid creating another manual source of truth. Store structured data once and
generate document sections from the portal when possible.

## Development Workflow

- Commit every meaningful change when the user asks for project work that should
  be saved in git.
- Use GitHub flow later: branch, pull request, CI passes, merge, tag release.
- Suggested early branches:
  - `feature/project-bootstrap`
  - `feature/inventory-model`
  - `feature/opennebula-vm-catalog`
  - `feature/agent-sessions`
  - `feature/permissions-audit`
- Write tests as features are created.
- Support Windows, Linux, and macOS, primarily through Docker Compose.
- Prefer local validation before external calls.
