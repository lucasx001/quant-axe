"""Read-only Cloudflare R2 adapter for news-collector SQLite snapshots."""

from __future__ import annotations

import sqlite3
import tempfile
import threading
import time
from contextlib import closing
from dataclasses import dataclass, replace
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from backend.app.services.config import (
    HOT_NEWS_SOURCES,
    NEWS_R2_ACCESS_KEY_ID,
    NEWS_R2_BUCKET_NAME,
    NEWS_R2_CACHE_TTL_SECONDS,
    NEWS_R2_ENDPOINT_URL,
    NEWS_R2_PREFIX,
    NEWS_R2_REGION,
    NEWS_R2_SECRET_ACCESS_KEY,
)


SHANGHAI_TZ = ZoneInfo("Asia/Shanghai")
FALLBACK_DAYS = 7
PLATFORM_NAMES = {
    "cls-hot": "财联社热门",
    "wallstreetcn-hot": "华尔街见闻",
    "ifeng": "凤凰网",
}


@dataclass(frozen=True)
class NewsSnapshot:  # pylint: disable=too-many-instance-attributes
    """Parsed news-collector snapshot retained in process memory."""

    key: str
    etag: str
    snapshot_date: str
    crawl_time: str
    stale: bool
    current_items: tuple[dict[str, Any], ...]
    daily_items: tuple[dict[str, Any], ...]
    source_status: dict[str, str]


@dataclass
class SnapshotCache:
    """Small process-local cache guarded for scheduler and API concurrency."""

    snapshot: NewsSnapshot | None = None
    checked_at: float = 0.0


_CACHE = SnapshotCache()
_LOCK = threading.Lock()


def r2_provider_status() -> dict[str, Any]:
    """Report whether the R2 provider has enough configuration to run."""

    missing = _missing_settings()
    return {
        "id": "news_collector.r2",
        "status": "not_configured" if missing else "configured",
        "role": "hot_news",
        "missing": missing,
    }


def reset_snapshot_cache() -> None:
    """Clear process-local state for tests and explicit refreshes."""

    with _LOCK:
        _CACHE.snapshot = None
        _CACHE.checked_at = 0.0


def refresh_snapshot(
    *,
    force: bool = False,
    now: datetime | None = None,
) -> NewsSnapshot:
    """Refresh the parsed R2 snapshot when its object ETag changes."""
    # pylint: disable=too-many-locals

    current_time = now or datetime.now(SHANGHAI_TZ)
    monotonic_now = time.monotonic()
    with _LOCK:
        if (
            not force
            and _CACHE.snapshot is not None
            and monotonic_now - _CACHE.checked_at < NEWS_R2_CACHE_TTL_SECONDS
        ):
            return _CACHE.snapshot

        missing = _missing_settings()
        if missing:
            raise RuntimeError(f"R2 news provider is missing settings: {', '.join(missing)}")

        client = _create_s3_client()
        today = current_time.date()
        errors: list[str] = []
        for offset in range(FALLBACK_DAYS + 1):
            target_date = today - timedelta(days=offset)
            key = _snapshot_key(target_date)
            try:
                head = client.head_object(Bucket=NEWS_R2_BUCKET_NAME, Key=key)
                etag = str(head.get("ETag") or "").strip('"')
            except Exception as error:  # pylint: disable=broad-exception-caught
                errors.append(f"{key}: {error}")
                continue

            if (
                _CACHE.snapshot is not None
                and _CACHE.snapshot.key == key
                and _CACHE.snapshot.etag == etag
            ):
                snapshot = replace(_CACHE.snapshot, stale=offset > 0)
                _CACHE.snapshot = snapshot
                _CACHE.checked_at = monotonic_now
                return snapshot

            try:
                response = client.get_object(Bucket=NEWS_R2_BUCKET_NAME, Key=key)
                payload = response["Body"].read()
                snapshot = parse_snapshot_bytes(
                    payload,
                    key=key,
                    etag=etag,
                    snapshot_date=target_date.isoformat(),
                    stale=offset > 0,
                )
            except Exception as error:  # pylint: disable=broad-exception-caught
                errors.append(f"{key}: {error}")
                continue

            _CACHE.snapshot = snapshot
            _CACHE.checked_at = monotonic_now
            return snapshot

        _CACHE.checked_at = monotonic_now
        detail = errors[-1] if errors else "no readable snapshot objects"
        raise RuntimeError(f"R2 news snapshots are unavailable: {detail}")


def get_hot_news_payload(
    sources: str | None = None,
    limit: int = 60,
) -> dict[str, Any]:
    """Return the latest R2 hot news snapshot for the serving API."""

    try:
        snapshot = refresh_snapshot()
    except Exception as error:  # pylint: disable=broad-exception-caught
        return {
            "source": "news_collector.r2",
            "status": "unavailable",
            "stale": False,
            "data": [],
            "source_status": {},
            "message": str(error),
        }

    selected_sources = parse_sources(sources)
    rows = [
        item
        for item in snapshot.current_items
        if item["source_id"] in selected_sources
    ]
    bounded_limit = max(1, min(limit, 200))
    return {
        "source": "news_collector.r2",
        "status": "ready" if rows else "empty",
        "snapshot_key": snapshot.key,
        "snapshot_etag": snapshot.etag,
        "snapshot_date": snapshot.snapshot_date,
        "snapshot_crawl_time": snapshot.crawl_time,
        "stale": snapshot.stale,
        "source_status": {
            source_id: snapshot.source_status.get(source_id, "missing")
            for source_id in selected_sources
        },
        "data": rows[:bounded_limit],
    }


def get_analysis_items(mode: str, limit: int) -> tuple[NewsSnapshot, list[dict[str, Any]]]:
    """Return cached current or daily items suitable for an AI prompt."""

    if mode not in {"current", "daily"}:
        raise ValueError(f"unsupported news analysis mode: {mode}")
    snapshot = refresh_snapshot()
    rows = snapshot.current_items if mode == "current" else snapshot.daily_items
    return snapshot, [dict(item) for item in rows[: max(1, limit)]]


def parse_sources(sources: str | None) -> tuple[str, ...]:
    """Restrict source filtering to the configured finance platforms."""

    if not sources:
        return HOT_NEWS_SOURCES
    requested = tuple(source.strip() for source in sources.split(",") if source.strip())
    selected = tuple(source for source in requested if source in HOT_NEWS_SOURCES)
    return selected or HOT_NEWS_SOURCES


def parse_snapshot_bytes(
    payload: bytes,
    *,
    key: str,
    etag: str,
    snapshot_date: str,
    stale: bool,
) -> NewsSnapshot:
    """Parse a news-collector SQLite object into serving and analysis rows."""

    with tempfile.TemporaryDirectory() as temporary:
        database = Path(temporary) / "snapshot.db"
        database.write_bytes(payload)
        uri = f"file:{database.as_posix()}?mode=ro"
        with closing(sqlite3.connect(uri, uri=True)) as connection:
            connection.row_factory = sqlite3.Row
            crawl_time = _latest_crawl_time(connection)
            source_status = _source_status(connection, crawl_time)
            daily_items = _read_items(connection)
            current_items = tuple(
                item for item in daily_items if item["last_crawl_time"] == crawl_time
            )
    return NewsSnapshot(
        key=key,
        etag=etag,
        snapshot_date=snapshot_date,
        crawl_time=crawl_time,
        stale=stale,
        current_items=current_items,
        daily_items=daily_items,
        source_status=source_status,
    )


def _latest_crawl_time(connection: sqlite3.Connection) -> str:
    row = connection.execute(
        "SELECT crawl_time FROM crawl_records ORDER BY crawl_time DESC LIMIT 1"
    ).fetchone()
    if row is None:
        raise ValueError("snapshot has no crawl records")
    return str(row["crawl_time"])


def _source_status(connection: sqlite3.Connection, crawl_time: str) -> dict[str, str]:
    rows = connection.execute(
        """
        SELECT css.platform_id, css.status
        FROM crawl_source_status css
        JOIN crawl_records cr ON cr.id = css.crawl_record_id
        WHERE cr.crawl_time = ?
        """,
        (crawl_time,),
    ).fetchall()
    return {str(row["platform_id"]): str(row["status"]) for row in rows}


def _read_items(connection: sqlite3.Connection) -> tuple[dict[str, Any], ...]:
    placeholders = ",".join("?" for _ in HOT_NEWS_SOURCES)
    rows = connection.execute(
        f"""
        SELECT n.id, n.title, n.platform_id, p.name AS platform_name,
               n.rank, n.url, n.mobile_url, n.first_crawl_time,
               n.last_crawl_time, n.crawl_count
        FROM news_items n
        LEFT JOIN platforms p ON p.id = n.platform_id
        WHERE n.platform_id IN ({placeholders})
        ORDER BY n.platform_id, n.rank, n.last_crawl_time DESC
        """,
        HOT_NEWS_SOURCES,
    ).fetchall()
    timelines = _rank_timelines(connection, [int(row["id"]) for row in rows])
    items = []
    for row in rows:
        platform_id = str(row["platform_id"])
        timeline = timelines.get(int(row["id"]), [])
        items.append(
            {
                "id": int(row["id"]),
                "title": str(row["title"]),
                "source_id": platform_id,
                "source": str(
                    row["platform_name"] or PLATFORM_NAMES.get(platform_id, platform_id)
                ),
                "source_name": str(
                    row["platform_name"] or PLATFORM_NAMES.get(platform_id, platform_id)
                ),
                "rank": int(row["rank"]),
                "url": str(row["url"] or ""),
                "mobile_url": str(row["mobile_url"] or ""),
                "first_crawl_time": str(row["first_crawl_time"]),
                "last_crawl_time": str(row["last_crawl_time"]),
                "crawl_count": int(row["crawl_count"]),
                "rank_timeline": timeline,
                "updated_at": str(row["last_crawl_time"]),
                "captured_at": str(row["last_crawl_time"]),
            }
        )
    return tuple(items)


def _rank_timelines(
    connection: sqlite3.Connection,
    news_ids: list[int],
) -> dict[int, list[dict[str, Any]]]:
    if not news_ids:
        return {}
    placeholders = ",".join("?" for _ in news_ids)
    rows = connection.execute(
        f"""
        SELECT news_item_id, rank, crawl_time
        FROM rank_history
        WHERE news_item_id IN ({placeholders})
        ORDER BY news_item_id, crawl_time
        """,
        news_ids,
    ).fetchall()
    timelines: dict[int, list[dict[str, Any]]] = {}
    for row in rows:
        rank = int(row["rank"])
        timelines.setdefault(int(row["news_item_id"]), []).append(
            {
                "time": str(row["crawl_time"]),
                "rank": rank if rank != 0 else None,
            }
        )
    return timelines


def _missing_settings() -> list[str]:
    settings = {
        "NEWS_R2_ENDPOINT_URL": NEWS_R2_ENDPOINT_URL,
        "NEWS_R2_BUCKET_NAME": NEWS_R2_BUCKET_NAME,
        "NEWS_R2_ACCESS_KEY_ID": NEWS_R2_ACCESS_KEY_ID,
        "NEWS_R2_SECRET_ACCESS_KEY": NEWS_R2_SECRET_ACCESS_KEY,
    }
    return [name for name, value in settings.items() if not value]


def _snapshot_key(target_date: date) -> str:
    return f"{NEWS_R2_PREFIX}/{target_date.isoformat()}.db"


def _create_s3_client():
    import boto3  # pylint: disable=import-error,import-outside-toplevel
    from botocore.config import Config  # pylint: disable=import-error,import-outside-toplevel

    kwargs: dict[str, Any] = {
        "endpoint_url": NEWS_R2_ENDPOINT_URL,
        "aws_access_key_id": NEWS_R2_ACCESS_KEY_ID,
        "aws_secret_access_key": NEWS_R2_SECRET_ACCESS_KEY,
        "config": Config(signature_version="s3v4"),
    }
    if NEWS_R2_REGION:
        kwargs["region_name"] = NEWS_R2_REGION
    return boto3.client("s3", **kwargs)
