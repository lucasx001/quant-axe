"""PostgreSQL persistence for Hikyuu backtest jobs."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, update

from backend.app.db.engine import session_scope
from backend.app.db.models import BacktestRun


def create_backtest_run(run_id: str, config: dict[str, Any], snapshot_id: str) -> None:
    """Queue a run with a frozen snapshot identifier."""

    with session_scope() as session:
        session.add(
            BacktestRun(
                id=run_id,
                status="queued",
                config=config,
                snapshot_id=snapshot_id,
                result=None,
                error=None,
                created_at=datetime.now(timezone.utc),
                started_at=None,
                finished_at=None,
            )
        )


def get_backtest_run(run_id: str) -> dict[str, Any] | None:
    """Load one run including its result when complete."""

    with session_scope() as session:
        row = session.execute(
            select(BacktestRun).where(BacktestRun.id == run_id)
        ).scalar_one_or_none()
        return _as_dict(row) if row is not None else None


def list_backtest_runs(limit: int = 30) -> list[dict[str, Any]]:
    """List newest runs without embedding large result documents."""

    statement = (
        select(BacktestRun).order_by(BacktestRun.created_at.desc()).limit(limit)
    )
    with session_scope() as session:
        return [_as_dict(row, include_result=False) for row in session.execute(statement).scalars()]


def mark_backtest_running(run_id: str) -> bool:
    """Claim a queued run exactly once."""

    statement = (
        update(BacktestRun)
        .where(BacktestRun.id == run_id, BacktestRun.status == "queued")
        .values(status="running", started_at=datetime.now(timezone.utc))
    )
    with session_scope() as session:
        return session.execute(statement).rowcount == 1


def finish_backtest_run(
    run_id: str, result: dict[str, Any] | None, error: str | None = None
) -> None:
    """Persist the result or an actionable error."""

    statement = (
        update(BacktestRun)
        .where(BacktestRun.id == run_id, BacktestRun.status == "running")
        .values(
            status="failed" if error else "completed",
            result=result,
            error=error,
            finished_at=datetime.now(timezone.utc),
        )
    )
    with session_scope() as session:
        if session.execute(statement).rowcount != 1:
            raise RuntimeError(f"Backtest run is not running: {run_id}")


def fail_queued_backtest_run(run_id: str, error: str) -> None:
    """Record process-launch failures before a worker claims the run."""

    statement = (
        update(BacktestRun)
        .where(BacktestRun.id == run_id, BacktestRun.status == "queued")
        .values(status="failed", error=error, finished_at=datetime.now(timezone.utc))
    )
    with session_scope() as session:
        session.execute(statement)


def _as_dict(row: BacktestRun, *, include_result: bool = True) -> dict[str, Any]:
    payload = {
        "id": row.id,
        "status": row.status,
        "config": row.config,
        "snapshot_id": row.snapshot_id,
        "error": row.error,
        "created_at": row.created_at.isoformat(),
        "started_at": row.started_at.isoformat() if row.started_at else None,
        "finished_at": row.finished_at.isoformat() if row.finished_at else None,
    }
    if include_result:
        payload["result"] = row.result
    return payload
