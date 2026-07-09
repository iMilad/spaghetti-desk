# Architecture

Spaghetti Desk should stay fast by separating page reads from external system
collection.

## Runtime Shape

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

## Performance Principles

- The frontend should read from the backend API, not from external tools.
- The backend should serve most pages from the local database.
- Collectors should update local state on a schedule and record collection
  freshness.
- List endpoints must support pagination from the beginning.
- High-cardinality data should be filtered server-side.
- Summaries should be precomputed or cached once real persistence exists.
- Long-running tasks should run outside request/response paths.

## Collector Boundary

Collectors are responsible for pulling data from external systems and writing
normalized records to the local inventory store. Collectors should be safe to
disable and should not be required for demo mode.

Each collector should record:

- Integration name and type
- Start and end time
- Status
- Records read and written
- Error summary
- Freshness timestamp

## Action Boundary

Mutating operations should not be hidden inside page loads or collectors. A
portal action should create an audited request, validate inputs, require approval
where needed, run a controlled script or action runner, and store the result.

The first action/audit module is documented in
[Action and Audit Foundation](action-audit.md). It starts as an append-only local
read model with public-safe demo data, then becomes the persistence target for
controlled action runners.

## Public Data Boundary

The public repository must only contain fake, example, or demo data. Local
company data should live outside this repository and be upgraded from public
releases as a downstream deployment.
