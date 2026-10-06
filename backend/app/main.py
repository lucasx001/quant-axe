from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from backend.app.services.backtest_center import (
    backtest_engine_status,
    get_backtest,
    list_backtests,
    start_backtest,
)
from backend.app.services.hikyuu_data import HikyuuDataError
from backend.app.services.data_center import (
    data_health,
    get_announcements,
    get_market_snapshot,
    get_served_kline,
    get_served_indexes,
    get_served_quote,
    get_served_quotes,
    list_data_jobs,
    quality_daily_bars,
    run_data_job,
    search_stock_profiles,
    stock_profile,
    stock_status,
    trading_days,
)
from backend.app.services.financials_data import get_financial_metrics
from backend.app.services.intraday_data import get_intraday, get_trade_prints
from backend.app.services.market_data import (
    get_order_book,
)
from backend.app.services.news_data import get_hot_news, get_stock_news
from backend.app.services.news_ai_analysis import get_latest_analysis
from backend.app.services.scheduler import scheduler_status, start_scheduler, stop_scheduler
from backend.app.services.search_data import search_universe
from backend.app.services.sentiment_data import get_hot_keywords
from backend.app.services.universe_center import (
    create_universe,
    get_universe as get_universe_payload,
    list_universes,
    preview_universe,
    remove_universe,
    snapshot_universe,
    universe_stocks,
    update_universe,
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    start_scheduler()
    try:
        yield
    finally:
        stop_scheduler()


app = FastAPI(
    title="QuantDash Market Data API",
    description="FastAPI BFF/data service for real A-share quote, K-line, and market index data.",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "quantdash-market-api"}


@app.get("/api/data/health")
def data_center_health() -> dict:
    return data_health()


@app.get("/api/data/jobs")
def data_jobs() -> dict:
    return list_data_jobs()


@app.post("/api/data/jobs/run")
def data_jobs_run(job_type: str = Query(..., alias="type")) -> dict:
    try:
        return run_data_job(job_type)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/data/scheduler")
def data_scheduler() -> dict:
    return scheduler_status()


@app.get("/api/backtests/hikyuu/status")
def hikyuu_backtest_status() -> dict:
    return backtest_engine_status()


@app.post("/api/backtests", status_code=202)
def backtests_create(payload: dict) -> dict:
    try:
        return start_backtest(payload)
    except (ValueError, HikyuuDataError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.get("/api/backtests")
def backtests_list() -> dict:
    return list_backtests()


@app.get("/api/backtests/{run_id}")
def backtests_get(run_id: str) -> dict:
    backtest = get_backtest(run_id)
    if backtest is None:
        raise HTTPException(status_code=404, detail="unknown backtest")
    return backtest


@app.get("/api/market/indexes")
def market_indexes() -> dict:
    try:
        return get_served_indexes()
    except Exception as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@app.get("/api/market/snapshot")
def market_snapshot(symbols: str = Query("")) -> dict:
    try:
        return get_market_snapshot(symbols)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@app.get("/api/stock/quote/{symbol}")
def stock_quote(symbol: str) -> dict:
    try:
        return get_served_quote(symbol)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@app.get("/api/stock/quotes")
def stock_quotes(symbols: str = Query(...)) -> dict:
    try:
        return get_served_quotes(symbols)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@app.get("/api/stock/kline/{symbol}")
def stock_kline(
    symbol: str,
    kline_type: Literal[
        "1min", "5day", "daily", "weekly", "monthly", "yearly"
    ] = Query("daily", alias="type"),
    adjust: Literal["none", "qfq", "hfq"] = Query("none"),
) -> dict:
    try:
        return get_served_kline(symbol, kline_type, adjust)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@app.get("/api/stocks/search")
def stocks_search(q: str = Query(""), limit: int = Query(20, ge=1, le=50)) -> dict:
    return search_universe(q, limit)


@app.get("/api/stocks/profiles")
def stocks_profiles_search(q: str = Query(""), limit: int = Query(20, ge=1, le=100)) -> dict:
    return search_stock_profiles(q, limit)


@app.get("/api/stocks/{symbol}/profile")
def stocks_profile(symbol: str) -> dict:
    try:
        return stock_profile(symbol)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@app.get("/api/calendar/trading-days")
def calendar_trading_days(
    start: str | None = Query(None),
    end: str | None = Query(None),
    exchange: str = Query("SSE"),
) -> dict:
    try:
        return trading_days(start, end, exchange)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@app.get("/api/stock/status/{symbol}")
def stock_daily_status(symbol: str, target_date: str | None = Query(None, alias="date")) -> dict:
    try:
        return stock_status(symbol, target_date)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@app.get("/api/data/quality/daily-bars/{symbol}")
def data_quality_daily_bars(
    symbol: str,
    adjust: Literal["none", "qfq", "hfq"] = Query("none"),
) -> dict:
    try:
        return quality_daily_bars(symbol, adjust)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@app.get("/api/stock/order-book/{symbol}")
def stock_order_book(symbol: str) -> dict:
    try:
        return get_order_book(symbol)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@app.get("/api/stock/intraday/{symbol}")
def stock_intraday(symbol: str) -> dict:
    try:
        return get_intraday(symbol)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/stock/trades/{symbol}")
def stock_trades(symbol: str, limit: int = Query(60, ge=1, le=200)) -> dict:
    try:
        return get_trade_prints(symbol, limit)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/stock/news/{symbol}")
def stock_news(symbol: str, limit: int = Query(30, ge=1, le=100)) -> dict:
    try:
        return get_stock_news(symbol, limit)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/stock/announcements/{symbol}")
def stock_announcements(symbol: str, limit: int = Query(30, ge=1, le=100)) -> dict:
    try:
        return get_announcements(symbol, limit)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/stock/financials/{symbol}")
def stock_financials(symbol: str) -> dict:
    try:
        return get_financial_metrics(symbol)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@app.get("/api/intelligence/hot-keywords")
def hot_keywords(limit: int = Query(40, ge=1, le=100)) -> dict:
    return get_hot_keywords(limit)


@app.get("/api/news/hot")
def hot_news(
    sources: str | None = Query(None),
    limit: int = Query(60, ge=1, le=200),
) -> dict:
    return get_hot_news(sources, limit)


@app.get("/api/news/analysis/latest")
def latest_news_analysis() -> dict:
    return get_latest_analysis()


@app.get("/api/universes")
def universes_list() -> dict:
    return list_universes()


@app.post("/api/universes")
def universes_create(payload: dict) -> dict:
    try:
        return create_universe(payload)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@app.get("/api/universes/{universe_id}")
def universes_get(universe_id: str) -> dict:
    try:
        return get_universe_payload(universe_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@app.patch("/api/universes/{universe_id}")
def universes_update(universe_id: str, payload: dict) -> dict:
    try:
        return update_universe(universe_id, payload)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@app.delete("/api/universes/{universe_id}")
def universes_delete(universe_id: str) -> dict:
    try:
        return remove_universe(universe_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@app.get("/api/universes/{universe_id}/stocks")
def universes_stocks(universe_id: str, target_date: str = Query(..., alias="date")) -> dict:
    try:
        return universe_stocks(universe_id, target_date)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@app.post("/api/universes/{universe_id}/preview")
def universes_preview(universe_id: str, payload: dict) -> dict:
    try:
        return preview_universe(universe_id, payload)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@app.post("/api/universes/{universe_id}/snapshot")
def universes_snapshot(universe_id: str, payload: dict) -> dict:
    try:
        return snapshot_universe(universe_id, payload)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
