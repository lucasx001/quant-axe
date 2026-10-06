"""Declarative SQLAlchemy models for PostgreSQL persistence."""
# pylint: disable=missing-class-docstring

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Float,
    Integer,
    PrimaryKeyConstraint,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Base class shared by all PostgreSQL models."""


class RawPayload(Base):
    __tablename__ = "raw_payloads"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    provider: Mapped[str] = mapped_column(Text)
    dataset: Mapped[str] = mapped_column(Text)
    symbol: Mapped[str | None] = mapped_column(Text)
    payload: Mapped[Any] = mapped_column(JSONB)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),  # pylint: disable=not-callable
    )


class StockProfile(Base):
    __tablename__ = "stock_profiles"

    symbol: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text)
    exchange: Mapped[str] = mapped_column(Text)
    industry: Mapped[str | None] = mapped_column(Text)
    listed_at: Mapped[date | None] = mapped_column(Date)
    delisted_at: Mapped[date | None] = mapped_column(Date)
    pinyin: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class TradeCalendar(Base):
    __tablename__ = "trade_calendar"
    __table_args__ = (PrimaryKeyConstraint("exchange", "date"),)

    exchange: Mapped[str] = mapped_column(Text)
    date: Mapped[date] = mapped_column(Date)
    is_open: Mapped[bool] = mapped_column(Boolean)
    source: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class DailyBar(Base):
    __tablename__ = "daily_bars"
    __table_args__ = (PrimaryKeyConstraint("symbol", "date", "adjust_type"),)

    symbol: Mapped[str] = mapped_column(Text)
    date: Mapped[date] = mapped_column(Date)
    open: Mapped[float | None] = mapped_column(Float)
    high: Mapped[float | None] = mapped_column(Float)
    low: Mapped[float | None] = mapped_column(Float)
    close: Mapped[float | None] = mapped_column(Float)
    volume: Mapped[int | None] = mapped_column(BigInteger)
    turnover: Mapped[float | None] = mapped_column(Float)
    amplitude: Mapped[float | None] = mapped_column(Float)
    change_rate: Mapped[float | None] = mapped_column(Float)
    change_amount: Mapped[float | None] = mapped_column(Float)
    turnover_rate: Mapped[float | None] = mapped_column(Float)
    adjust_type: Mapped[str] = mapped_column(Text)
    source: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class StockStatus(Base):
    __tablename__ = "stock_status"
    __table_args__ = (PrimaryKeyConstraint("symbol", "date"),)

    symbol: Mapped[str] = mapped_column(Text)
    date: Mapped[date] = mapped_column(Date)
    is_st: Mapped[bool] = mapped_column(Boolean)
    is_suspended: Mapped[bool] = mapped_column(Boolean)
    source: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class LimitPrice(Base):
    __tablename__ = "limit_prices"
    __table_args__ = (PrimaryKeyConstraint("symbol", "date"),)

    symbol: Mapped[str] = mapped_column(Text)
    date: Mapped[date] = mapped_column(Date)
    up_limit: Mapped[float | None] = mapped_column(Float)
    down_limit: Mapped[float | None] = mapped_column(Float)
    source: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class FinancialMetric(Base):
    __tablename__ = "financial_metrics"
    __table_args__ = (PrimaryKeyConstraint("symbol", "report_period", "source"),)

    symbol: Mapped[str] = mapped_column(Text)
    report_period: Mapped[str] = mapped_column(Text)
    pe_ttm: Mapped[float | None] = mapped_column(Float)
    pb: Mapped[float | None] = mapped_column(Float)
    roe: Mapped[float | None] = mapped_column(Float)
    gross_margin: Mapped[float | None] = mapped_column(Float)
    source: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class HotNewsItem(Base):
    __tablename__ = "hot_news_items"
    __table_args__ = (UniqueConstraint("source_id", "title", "captured_at"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    source_id: Mapped[str] = mapped_column(Text)
    source_name: Mapped[str] = mapped_column(Text)
    rank: Mapped[int | None] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(Text)
    url: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class NewsItem(Base):
    __tablename__ = "news_items"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    symbol: Mapped[str | None] = mapped_column(Text)
    title: Mapped[str] = mapped_column(Text)
    summary: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(Text)
    url: Mapped[str | None] = mapped_column(Text)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    type: Mapped[str] = mapped_column(Text)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class HotKeyword(Base):
    __tablename__ = "hot_keywords"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    word: Mapped[str] = mapped_column(Text)
    heat: Mapped[float | None] = mapped_column(Float)
    sources: Mapped[Any] = mapped_column(JSONB)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class HotNewsAIAnalysis(Base):
    __tablename__ = "hot_news_ai_analyses"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    snapshot_key: Mapped[str] = mapped_column(Text)
    snapshot_etag: Mapped[str] = mapped_column(Text)
    snapshot_date: Mapped[date] = mapped_column(Date)
    snapshot_crawl_time: Mapped[str] = mapped_column(Text)
    node_key: Mapped[str] = mapped_column(Text)
    analysis_mode: Mapped[str] = mapped_column(Text)
    model: Mapped[str] = mapped_column(Text)
    content: Mapped[Any] = mapped_column(JSONB)
    analyzed_news: Mapped[int] = mapped_column(Integer)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class HotNewsAIAnalysisRun(Base):
    __tablename__ = "hot_news_ai_analysis_runs"
    __table_args__ = (
        UniqueConstraint("execution_date", "node_key", "scheduled_time"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    execution_date: Mapped[date] = mapped_column(Date)
    node_key: Mapped[str] = mapped_column(Text)
    scheduled_time: Mapped[str] = mapped_column(Text)
    analysis_mode: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text)
    snapshot_key: Mapped[str | None] = mapped_column(Text)
    snapshot_etag: Mapped[str | None] = mapped_column(Text)
    calendar_degraded: Mapped[bool] = mapped_column(Boolean)
    error: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class DataJob(Base):
    __tablename__ = "data_jobs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    job_type: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error: Mapped[str | None] = mapped_column(Text)


class Universe(Base):
    __tablename__ = "universes"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text)
    base: Mapped[str] = mapped_column(Text)
    filters: Mapped[Any] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class UniverseMember(Base):
    __tablename__ = "universe_members"
    __table_args__ = (PrimaryKeyConstraint("universe_id", "date", "symbol"),)

    universe_id: Mapped[str] = mapped_column(Text)
    date: Mapped[date] = mapped_column(Date)
    symbol: Mapped[str] = mapped_column(Text)
    name: Mapped[str] = mapped_column(Text)
    included: Mapped[bool] = mapped_column(Boolean)
    excluded_reason: Mapped[str | None] = mapped_column(Text)
    can_buy: Mapped[bool] = mapped_column(Boolean)
    can_sell: Mapped[bool] = mapped_column(Boolean)
    flags: Mapped[Any] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class BacktestRun(Base):
    """Persist an exploratory Hikyuu run and its reproducible input manifest."""

    __tablename__ = "backtest_runs"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    status: Mapped[str] = mapped_column(Text)
    config: Mapped[Any] = mapped_column(JSONB)
    snapshot_id: Mapped[str] = mapped_column(Text)
    result: Mapped[Any | None] = mapped_column(JSONB)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
