"""Create and inspect isolated Hikyuu backtest jobs."""

from __future__ import annotations

import os
import subprocess
import sys
from dataclasses import asdict
from pathlib import Path
from typing import Any
from uuid import uuid4

from backend.app.db.repositories.backtests import (
    create_backtest_run,
    fail_queued_backtest_run,
    get_backtest_run,
    list_backtest_runs,
)
from backend.app.services.hikyuu_data import (
    active_snapshot_root,
    hikyuu_status,
    verify_snapshot,
)
from backend.app.services.hikyuu_engine import HikyuuBacktestConfig, validate_backtest_config


def _parse_config(payload: dict[str, Any]) -> HikyuuBacktestConfig:
    if not isinstance(payload.get("symbols"), list):
        raise ValueError("symbols must be a list of A-share codes")
    try:
        config = HikyuuBacktestConfig(
            symbols=tuple(payload["symbols"]),
            start_date=payload["start_date"],
            end_date=payload["end_date"],
            initial_cash=float(payload.get("initial_cash", 300_000)),
            fast_period=int(payload.get("fast_period", 5)),
            slow_period=int(payload.get("slow_period", 10)),
            commission_rate=float(payload.get("commission_rate", 0.0003)),
            stamp_tax_rate=float(payload.get("stamp_tax_rate", 0.0005)),
            snapshot_id=payload.get("snapshot_id"),
        )
    except (KeyError, TypeError, ValueError) as error:
        raise ValueError(f"Invalid Hikyuu backtest config: {error}") from error
    validate_backtest_config(config)
    return config


def start_backtest(payload: dict[str, Any]) -> dict[str, Any]:
    """Store a queued job and start one dedicated Hikyuu worker process."""

    config = _parse_config(payload)
    _, manifest = verify_snapshot(active_snapshot_root(), config.snapshot_id)
    config = HikyuuBacktestConfig(**{**asdict(config), "snapshot_id": manifest["snapshot_id"]})
    run_id = uuid4().hex
    create_backtest_run(run_id, asdict(config), manifest["snapshot_id"])

    repository_root = Path(__file__).resolve().parents[3]
    log_dir = active_snapshot_root().parent / "job-logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    command = [sys.executable, "-m", "backend.scripts.run_hikyuu_job", run_id]
    creation_flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    try:
        with (log_dir / f"{run_id}.log").open("w", encoding="utf-8") as stream:
            subprocess.Popen(  # pylint: disable=consider-using-with
                command,
                cwd=repository_root,
                stdout=stream,
                stderr=subprocess.STDOUT,
                creationflags=creation_flags,
            )
    except OSError as error:
        fail_queued_backtest_run(run_id, str(error))
        raise RuntimeError(f"Could not start Hikyuu worker: {error}") from error
    return {"id": run_id, "status": "queued", "snapshot_id": manifest["snapshot_id"]}


def get_backtest(run_id: str) -> dict[str, Any] | None:
    """Return a stored job and its result."""

    return get_backtest_run(run_id)


def list_backtests() -> dict[str, Any]:
    """Return the most recent exploratory backtests."""

    return {"status": "ready", "data": list_backtest_runs()}


def backtest_engine_status() -> dict[str, Any]:
    """Return local Hikyuu installation and data-snapshot readiness."""

    return hikyuu_status()
