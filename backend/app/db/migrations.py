"""Programmatic Alembic entrypoints used by backend jobs."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect
from sqlalchemy.engine.reflection import Inspector

from backend.app.db.engine import engine
from backend.app.db.models import Base

ALEMBIC_VERSION_TABLE = "alembic_version"
LEGACY_BASELINE_REVISION = "20260602_0001"
LEGACY_TABLE_NAMES = frozenset(
    table_name
    for table_name in Base.metadata.tables
    if table_name not in {"hot_news_ai_analyses", "hot_news_ai_analysis_runs", "backtest_runs"}
)

def alembic_config() -> Config:
    """Load the repository Alembic configuration."""

    repository_root = Path(__file__).resolve().parents[3]
    return Config(repository_root / "alembic.ini")


def upgrade_database(revision: str = "head") -> dict[str, Any]:
    """Apply database migrations through the requested revision."""

    command.upgrade(alembic_config(), revision)
    return {"status": "ready", "revision": revision}


def bootstrap_mode(table_names: set[str]) -> str:
    """Choose the safe initialization path for a PostgreSQL schema."""

    if ALEMBIC_VERSION_TABLE in table_names:
        return "upgrade"

    legacy_tables = table_names & LEGACY_TABLE_NAMES
    if not legacy_tables:
        return "upgrade"

    missing_tables = LEGACY_TABLE_NAMES - legacy_tables
    if missing_tables:
        missing = ", ".join(sorted(missing_tables))
        raise RuntimeError(f"database has a partial legacy schema; missing tables: {missing}")

    return "stamp_legacy"


def validate_legacy_schema(inspector: Inspector) -> None:
    """Reject legacy schemas that do not match the Alembic baseline."""

    errors: list[str] = []
    for table_name in sorted(LEGACY_TABLE_NAMES):
        expected_table = Base.metadata.tables[table_name]
        expected_columns = set(expected_table.columns.keys())
        actual_columns = {column["name"] for column in inspector.get_columns(table_name)}
        if actual_columns != expected_columns:
            missing = sorted(expected_columns - actual_columns)
            extra = sorted(actual_columns - expected_columns)
            errors.append(f"{table_name} columns mismatch: missing={missing}, extra={extra}")

        expected_primary_key = {column.name for column in expected_table.primary_key.columns}
        actual_primary_key = set(
            inspector.get_pk_constraint(table_name).get("constrained_columns") or []
        )
        if actual_primary_key != expected_primary_key:
            errors.append(
                f"{table_name} primary key mismatch: "
                f"expected={sorted(expected_primary_key)}, actual={sorted(actual_primary_key)}"
            )

    if errors:
        details = "; ".join(errors)
        raise RuntimeError(f"legacy database schema does not match Alembic baseline: {details}")


def initialize_database() -> dict[str, Any]:
    """Upgrade a managed schema or safely adopt the pre-Alembic baseline."""

    inspector = inspect(engine)
    mode = bootstrap_mode(set(inspector.get_table_names()))
    if mode == "stamp_legacy":
        validate_legacy_schema(inspector)
        command.stamp(alembic_config(), LEGACY_BASELINE_REVISION)

    result = upgrade_database()
    return {**result, "bootstrap": mode}


if __name__ == "__main__":
    print(initialize_database())
