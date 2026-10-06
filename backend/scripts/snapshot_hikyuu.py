"""Freeze data produced by the Hikyuu official importer after it exits."""

from __future__ import annotations

from backend.app.services.hikyuu_data import (
    active_snapshot_root,
    create_snapshot,
    default_config_file,
)


def main() -> None:
    """Create a versioned read-only input for a reproducible backtest."""

    manifest = create_snapshot(default_config_file(), active_snapshot_root())
    print(f"Created Hikyuu snapshot {manifest['snapshot_id']}")


if __name__ == "__main__":
    main()
