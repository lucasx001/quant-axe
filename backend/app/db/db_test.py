from __future__ import annotations

import unittest
from typing import Any

from backend.app.db.engine import sqlalchemy_database_url
from backend.app.db.migrations import (
    ALEMBIC_VERSION_TABLE,
    LEGACY_TABLE_NAMES,
    bootstrap_mode,
    validate_legacy_schema,
)
from backend.app.db.models import Base


class FakeInspector:
    """Minimal schema inspector used by migration bootstrap tests."""

    def __init__(self) -> None:
        self.columns = {
            table_name: [{"name": column.name} for column in table.columns]
            for table_name, table in Base.metadata.tables.items()
        }
        self.primary_keys = {
            table_name: [column.name for column in table.primary_key.columns]
            for table_name, table in Base.metadata.tables.items()
        }

    def get_columns(self, table_name: str) -> list[dict[str, Any]]:
        return self.columns[table_name]

    def get_pk_constraint(self, table_name: str) -> dict[str, list[str]]:
        return {"constrained_columns": self.primary_keys[table_name]}


class DatabaseInfrastructureTest(unittest.TestCase):
    """SQLAlchemy metadata and connection configuration tests."""

    def test_selects_psycopg_three_dialect_for_legacy_postgres_dsn(self) -> None:
        self.assertEqual(
            "postgresql+psycopg://user:password@localhost/database",
            sqlalchemy_database_url("postgresql://user:password@localhost/database"),
        )

    def test_preserves_explicit_sqlalchemy_driver(self) -> None:
        self.assertEqual(
            "postgresql+psycopg://user:password@localhost/database",
            sqlalchemy_database_url("postgresql+psycopg://user:password@localhost/database"),
        )

    def test_metadata_contains_data_center_tables(self) -> None:
        self.assertEqual(
            {
                "backtest_runs",
                "daily_bars",
                "data_jobs",
                "financial_metrics",
                "hot_keywords",
                "hot_news_ai_analyses",
                "hot_news_ai_analysis_runs",
                "hot_news_items",
                "limit_prices",
                "news_items",
                "raw_payloads",
                "stock_profiles",
                "stock_status",
                "trade_calendar",
                "universe_members",
                "universes",
            },
            set(Base.metadata.tables),
        )

    def test_bootstrap_upgrades_empty_and_managed_databases(self) -> None:
        self.assertEqual("upgrade", bootstrap_mode(set()))
        self.assertEqual("upgrade", bootstrap_mode({ALEMBIC_VERSION_TABLE}))

    def test_bootstrap_stamps_complete_legacy_database(self) -> None:
        self.assertEqual("stamp_legacy", bootstrap_mode(set(LEGACY_TABLE_NAMES)))

    def test_bootstrap_rejects_partial_legacy_database(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "partial legacy schema"):
            bootstrap_mode({"raw_payloads"})

    def test_legacy_schema_validation_accepts_matching_tables(self) -> None:
        validate_legacy_schema(FakeInspector())  # type: ignore[arg-type]

    def test_legacy_schema_validation_rejects_column_mismatch(self) -> None:
        inspector = FakeInspector()
        inspector.columns["raw_payloads"] = [{"name": "id"}]
        with self.assertRaisesRegex(RuntimeError, "raw_payloads columns mismatch"):
            validate_legacy_schema(inspector)  # type: ignore[arg-type]


if __name__ == "__main__":
    unittest.main()
