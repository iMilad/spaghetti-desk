# Spaghetti Desk Backend

FastAPI backend for Spaghetti Desk.

The initial implementation serves public-safe demo inventory from JSON files.
That keeps the first API shape useful while preserving the intended production
boundary: page reads should come from local state, while collectors update that
state in the background.

## Local Development

```bash
uv sync --all-extras --dev
uv run pytest
uv run uvicorn app.main:app --reload
```

Database migrations:

```bash
uv run alembic upgrade head
```

`SPAGHETTI_DATABASE_URL` controls the target database. Docker Compose points it
at the local PostgreSQL service; local one-off checks can use SQLite.
