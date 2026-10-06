"""Run a queued Hikyuu backtest in its own process."""

from __future__ import annotations

import sys

from backend.app.db.repositories.backtests import (
    finish_backtest_run,
    get_backtest_run,
    mark_backtest_running,
)
from backend.app.services.hikyuu_engine import HikyuuBacktestConfig, run_hikyuu_backtest


def main(run_id: str) -> None:
    """Claim, execute, and persist one queued job."""

    if not mark_backtest_running(run_id):
        raise RuntimeError(f"Backtest job is not queued: {run_id}")
    job = get_backtest_run(run_id)
    if job is None:
        raise RuntimeError(f"Backtest job disappeared: {run_id}")
    try:
        config = HikyuuBacktestConfig(**job["config"])
        result = run_hikyuu_backtest(config)
    except Exception as error:  # pylint: disable=broad-exception-caught
        finish_backtest_run(run_id, None, error=str(error))
        raise
    finish_backtest_run(run_id, result)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: python -m backend.scripts.run_hikyuu_job RUN_ID")
    main(sys.argv[1])
