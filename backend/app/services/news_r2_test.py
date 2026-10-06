"""Tests for read-only parsing of news-collector R2 snapshots."""
# pylint: disable=line-too-long,missing-class-docstring

from __future__ import annotations

import sqlite3
import tempfile
import unittest
from datetime import datetime
from io import BytesIO
from pathlib import Path
from unittest.mock import patch
from zoneinfo import ZoneInfo

from backend.app.services import news_r2
from backend.app.services.news_r2 import parse_snapshot_bytes


class NewsR2SnapshotTest(unittest.TestCase):
    def test_parses_current_and_daily_items_with_rank_timeline(self) -> None:
        payload = make_snapshot()

        snapshot = parse_snapshot_bytes(
            payload,
            key="news/2026-06-02.db",
            etag="etag-1",
            snapshot_date="2026-06-02",
            stale=False,
        )

        self.assertEqual("2026-06-02 10:00:00", snapshot.crawl_time)
        self.assertEqual(2, len(snapshot.current_items))
        self.assertEqual(3, len(snapshot.daily_items))
        self.assertEqual("success", snapshot.source_status["cls-hot"])
        self.assertEqual(
            [{"time": "2026-06-02 09:30:00", "rank": 3}, {"time": "2026-06-02 10:00:00", "rank": 1}],
            snapshot.current_items[0]["rank_timeline"],
        )

    def test_filters_non_finance_platforms(self) -> None:
        snapshot = parse_snapshot_bytes(
            make_snapshot(),
            key="news/2026-06-02.db",
            etag="etag-1",
            snapshot_date="2026-06-02",
            stale=False,
        )

        self.assertNotIn("baidu", {item["source_id"] for item in snapshot.daily_items})

    def test_falls_back_to_previous_day_and_reuses_unchanged_etag(self) -> None:
        client = FakeS3Client(make_snapshot())
        now = datetime(2026, 6, 2, 10, 0, tzinfo=ZoneInfo("Asia/Shanghai"))
        with patch.multiple(
            news_r2,
            NEWS_R2_ENDPOINT_URL="https://example.r2.cloudflarestorage.com",
            NEWS_R2_BUCKET_NAME="bucket",
            NEWS_R2_ACCESS_KEY_ID="access",
            NEWS_R2_SECRET_ACCESS_KEY="secret",
        ), patch.object(news_r2, "_create_s3_client", return_value=client):
            news_r2.reset_snapshot_cache()
            first = news_r2.refresh_snapshot(force=True, now=now)
            second = news_r2.refresh_snapshot(force=True, now=now)

        self.assertTrue(first.stale)
        self.assertEqual("news/2026-06-01.db", first.key)
        self.assertEqual(first, second)
        self.assertEqual(1, client.download_count)


class FakeS3Client:
    def __init__(self, payload: bytes) -> None:
        self.payload = payload
        self.download_count = 0

    def head_object(self, *, Bucket: str, Key: str) -> dict:
        del Bucket
        if Key != "news/2026-06-01.db":
            raise RuntimeError("missing")
        return {"ETag": '"etag-1"'}

    def get_object(self, *, Bucket: str, Key: str) -> dict:
        del Bucket, Key
        self.download_count += 1
        return {"Body": BytesIO(self.payload)}


def make_snapshot() -> bytes:
    with tempfile.TemporaryDirectory() as temporary:
        database = Path(temporary) / "snapshot.db"
        connection = sqlite3.connect(database)
        connection.executescript(
            """
            CREATE TABLE platforms (id TEXT PRIMARY KEY, name TEXT NOT NULL);
            CREATE TABLE news_items (
              id INTEGER PRIMARY KEY, title TEXT NOT NULL, platform_id TEXT NOT NULL,
              rank INTEGER NOT NULL, url TEXT, mobile_url TEXT, first_crawl_time TEXT NOT NULL,
              last_crawl_time TEXT NOT NULL, crawl_count INTEGER NOT NULL
            );
            CREATE TABLE rank_history (
              id INTEGER PRIMARY KEY, news_item_id INTEGER NOT NULL, rank INTEGER NOT NULL,
              crawl_time TEXT NOT NULL
            );
            CREATE TABLE crawl_records (
              id INTEGER PRIMARY KEY, crawl_time TEXT NOT NULL, total_items INTEGER
            );
            CREATE TABLE crawl_source_status (
              crawl_record_id INTEGER NOT NULL, platform_id TEXT NOT NULL, status TEXT NOT NULL
            );
            INSERT INTO platforms VALUES
              ('cls-hot', '财联社热门'), ('wallstreetcn-hot', '华尔街见闻'),
              ('ifeng', '凤凰网'), ('baidu', '百度热搜');
            INSERT INTO crawl_records VALUES
              (1, '2026-06-02 09:30:00', 2), (2, '2026-06-02 10:00:00', 3);
            INSERT INTO crawl_source_status VALUES
              (2, 'cls-hot', 'success'), (2, 'wallstreetcn-hot', 'success'),
              (2, 'ifeng', 'failed');
            INSERT INTO news_items VALUES
              (1, 'AI 芯片需求增长', 'cls-hot', 1, 'https://a', '', '2026-06-02 09:30:00', '2026-06-02 10:00:00', 2),
              (2, '人民币汇率观察', 'wallstreetcn-hot', 2, 'https://b', '', '2026-06-02 10:00:00', '2026-06-02 10:00:00', 1),
              (3, '盘前政策信号', 'ifeng', 4, 'https://c', '', '2026-06-02 09:30:00', '2026-06-02 09:30:00', 1),
              (4, '综合娱乐热点', 'baidu', 1, 'https://d', '', '2026-06-02 10:00:00', '2026-06-02 10:00:00', 1);
            INSERT INTO rank_history VALUES
              (1, 1, 3, '2026-06-02 09:30:00'),
              (2, 1, 1, '2026-06-02 10:00:00'),
              (3, 2, 2, '2026-06-02 10:00:00');
            """
        )
        connection.commit()
        connection.close()
        return database.read_bytes()


if __name__ == "__main__":
    unittest.main()
