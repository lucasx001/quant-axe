"""Regression checks for immutable Hikyuu input snapshots."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from backend.app.services.hikyuu_data import HikyuuDataError, create_snapshot, verify_snapshot
from backend.app.services.hikyuu_engine import (
    HikyuuBacktestConfig,
    market_code,
    validate_backtest_config,
)


class HikyuuSnapshotTests(unittest.TestCase):
    """A run must not read files that changed after snapshot creation."""

    def test_snapshot_detects_mutated_historical_data(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data = root / "imported"
            data.mkdir()
            for name in ("stock.db", "sh_day.h5", "sz_day.h5"):
                (data / name).write_bytes(b"sample historic data")
            config = root / "hikyuu.ini"
            config.write_text(
                "[hikyuu]\n"
                f"datadir = {data.as_posix()}\n"
                "[baseinfo]\n"
                "type = sqlite3\n"
                f"db = {(data / 'stock.db').as_posix()}\n"
                "[kdata]\n"
                "type = hdf5\n"
                f"sh_day = {(data / 'sh_day.h5').as_posix()}\n"
                f"sz_day = {(data / 'sz_day.h5').as_posix()}\n",
                encoding="utf-8",
            )
            snapshot_root = root / "snapshots"
            manifest = create_snapshot(config, snapshot_root)
            snapshot_dir, _ = verify_snapshot(snapshot_root, manifest["snapshot_id"])
            self.assertEqual((snapshot_dir / "stock.db").read_bytes(), b"sample historic data")
            (snapshot_dir / "sh_day.h5").write_bytes(b"changed")
            with self.assertRaises(HikyuuDataError):
                verify_snapshot(snapshot_root, manifest["snapshot_id"])
            (snapshot_dir / "sh_day.h5").write_bytes(b"sample historic data")
            (snapshot_dir / "hikyuu.ini").write_text("[changed]", encoding="utf-8")
            with self.assertRaises(HikyuuDataError):
                verify_snapshot(snapshot_root, manifest["snapshot_id"])

    def test_missing_required_market_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "stock.db").write_bytes(b"stock")
            (root / "sh_day.h5").write_bytes(b"bars")
            config = root / "hikyuu.ini"
            config.write_text(
                "[hikyuu]\n"
                f"datadir = {root.as_posix()}\n"
                "[baseinfo]\n"
                "type = sqlite3\n"
                f"db = {(root / 'stock.db').as_posix()}\n"
                "[kdata]\n"
                "type = hdf5\n"
                f"sh_day = {(root / 'sh_day.h5').as_posix()}\n",
                encoding="utf-8",
            )
            with self.assertRaises(HikyuuDataError):
                create_snapshot(config, root / "snapshots")


class HikyuuConfigTests(unittest.TestCase):
    """Reject invalid markets and forward-looking date ranges."""

    def test_a_share_codes_map_to_hikyuu(self) -> None:
        self.assertEqual(market_code("600519"), "sh600519")
        self.assertEqual(market_code("000001"), "sz000001")
        self.assertEqual(market_code("830799"), "bj830799")
        self.assertEqual(market_code("920001"), "bj920001")
        with self.assertRaises(ValueError):
            market_code("900901")

    def test_invalid_date_order_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            validate_backtest_config(
                HikyuuBacktestConfig(
                    symbols=("600519",), start_date="2025-01-02", end_date="2025-01-01"
                )
            )


if __name__ == "__main__":
    unittest.main()
