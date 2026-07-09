from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import Engine, inspect

from app.persistence.database import engine

COLLECTOR_REQUIRED_TABLES = ("collector_runs", "pipelines")


class InventorySchemaNotReady(RuntimeError):
    pass


def assert_collector_schema_ready(
    inventory_engine: Engine = engine,
    *,
    required_tables: Iterable[str] = COLLECTOR_REQUIRED_TABLES,
) -> None:
    missing_tables = missing_required_tables(inventory_engine, required_tables)
    if not missing_tables:
        return

    formatted_tables = ", ".join(missing_tables)
    raise InventorySchemaNotReady(
        "Inventory database is not initialized for collectors. "
        f"Missing table(s): {formatted_tables}. "
        "Run `cd backend && uv run alembic upgrade head` before enabling collectors."
    )


def missing_required_tables(
    inventory_engine: Engine,
    required_tables: Iterable[str],
) -> tuple[str, ...]:
    existing_tables = set(inspect(inventory_engine).get_table_names())
    return tuple(sorted(set(required_tables) - existing_tables))
