"""Run an explicitly exploratory A-share backtest with Hikyuu's portfolio engine."""
# Hikyuu exports C++ extension members dynamically, which Pylint cannot inspect.
# pylint: disable=no-member

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date, timedelta
from math import isfinite
from types import ModuleType
from typing import Any

from backend.app.services.hikyuu_data import HikyuuDataError, active_snapshot_root, verify_snapshot


@dataclass(frozen=True)
class HikyuuBacktestConfig:  # pylint: disable=too-many-instance-attributes
    """Inputs for the first fixed-universe EMA cross integration slice."""

    symbols: tuple[str, ...]
    start_date: str
    end_date: str
    initial_cash: float = 300_000.0
    fast_period: int = 5
    slow_period: int = 10
    commission_rate: float = 0.0003
    stamp_tax_rate: float = 0.0005
    snapshot_id: str | None = None


def market_code(symbol: str) -> str:
    """Convert a six-digit A-share symbol to Hikyuu's market code."""

    if len(symbol) != 6 or not symbol.isascii() or not symbol.isdigit():
        raise ValueError(f"Expected a six-digit A-share code: {symbol}")
    if symbol.startswith("6"):
        return f"sh{symbol}"
    if symbol.startswith(("0", "3")):
        return f"sz{symbol}"
    if symbol.startswith(("4", "8", "920")):
        return f"bj{symbol}"
    raise ValueError(f"Unsupported A-share code: {symbol}")


def validate_backtest_config(config: HikyuuBacktestConfig) -> tuple[date, date]:
    """Reject ambiguous or unsafe backtest inputs before loading the engine."""

    if (
        not config.symbols
        or len(config.symbols) > 20
        or len(set(config.symbols)) != len(config.symbols)
    ):
        raise ValueError("Supply 1 to 20 distinct stock symbols")
    for symbol in config.symbols:
        if not isinstance(symbol, str):
            raise ValueError("Stock symbols must be six-digit strings")
        market_code(symbol)
    if not isinstance(config.start_date, str) or not isinstance(config.end_date, str):
        raise ValueError("Backtest dates must use YYYY-MM-DD")
    start = date.fromisoformat(config.start_date)
    end = date.fromisoformat(config.end_date)
    if end < start or end > date.today():
        raise ValueError("Backtest date range must be ordered and end by today")
    if (
        not isfinite(config.initial_cash)
        or config.initial_cash <= 0
        or not 2 <= config.fast_period < config.slow_period <= 250
    ):
        raise ValueError("Initial cash and EMA periods are invalid")
    if (
        not isfinite(config.commission_rate)
        or not isfinite(config.stamp_tax_rate)
        or not 0 <= config.commission_rate <= 0.01
        or not 0 <= config.stamp_tax_rate <= 0.01
    ):
        raise ValueError("Trading cost rates must be between 0 and 0.01")
    if config.snapshot_id is not None and not isinstance(config.snapshot_id, str):
        raise ValueError("Snapshot ID must be a string")
    return start, end


def _checked_stocks(
    h: ModuleType, codes: list[str], query: Any, *, slow_period: int, start: date, end: date
) -> tuple[list[Any], list[dict[str, Any]]]:
    """Reject missing or malformed daily bars before executing any trades."""

    stocks = [h.sm[code] for code in codes]
    coverage: list[dict[str, Any]] = []
    for code, stock in zip(codes, stocks, strict=True):
        if stock.is_null():
            raise HikyuuDataError(f"Hikyuu snapshot has no stock: {code}")
        daily_bars = stock.get_kdata(query)
        if len(daily_bars) < slow_period + 2:
            raise HikyuuDataError(f"Hikyuu snapshot has too few daily bars for {code}")
        dates = [daily_bar.datetime.date() for daily_bar in daily_bars]
        if dates != sorted(set(dates)):
            raise HikyuuDataError(f"Hikyuu daily bars are unordered or duplicated for {code}")
        if dates[0] > start + timedelta(days=15) or dates[-1] < end - timedelta(days=15):
            raise HikyuuDataError(f"Hikyuu daily bars do not cover the requested range for {code}")
        if any(
            min(daily_bar.open, daily_bar.high, daily_bar.low, daily_bar.close) <= 0
            for daily_bar in daily_bars
        ):
            raise HikyuuDataError(f"Hikyuu daily bars include invalid prices for {code}")
        coverage.append(
            {
                "symbol": code,
                "bars": len(daily_bars),
                "first_date": str(dates[0]),
                "last_date": str(dates[-1]),
            }
        )
    return stocks, coverage


def _execute_portfolio(
    h: ModuleType, config: HikyuuBacktestConfig, stocks: list[Any], query: Any, start: date
) -> Any:
    """Build one Hikyuu portfolio and return its account manager."""

    trade_cost = h.TC_FixedA(config.commission_rate, 5.0, config.stamp_tax_rate, 0.00001, 0.0)
    tm = h.crtTM(
        date=h.Datetime(start.isoformat()), init_cash=config.initial_cash, cost_func=trade_cost
    )
    signal = h.SG_Flex(h.EMA(h.CLOSE(), n=config.fast_period), slow_n=config.slow_period)
    prototype = h.SYS_Simple(sg=signal, mm=h.MM_Nothing())
    prototype.set_param("buy_delay", True)
    prototype.set_param("sell_delay", True)
    selector = h.SE_Fixed(stocks, prototype)
    portfolio = h.PF_Simple(
        tm=tm, se=selector, af=h.AF_EqualWeight(), adjust_cycle=1, adjust_mode="day"
    )
    portfolio.run(query)
    return portfolio.tm


def _equity_curve(calendar: Any, funds: Any) -> list[dict[str, Any]]:
    """Map daily Hikyuu account values to API rows."""

    return [
        {
            "date": str(day.date()),
            "cash": round(float(fund.cash), 2),
            "market_value": round(float(fund.market_value), 2),
            "total_assets": round(float(fund.total_assets), 2),
        }
        for day, fund in zip(calendar, funds, strict=True)
    ]


def _trade_records(h: ModuleType, account: Any) -> list[dict[str, Any]]:
    """Map real buy and sell records to API rows."""

    return [
        {
            "date": str(record.datetime.date()),
            "symbol": record.stock.market_code,
            "business": str(record.business),
            "quantity": float(record.number),
            "price": float(record.real_price),
            "cost": float(record.cost.total),
        }
        for record in account.get_trade_list()
        if record.business in {h.BUSINESS.BUY, h.BUSINESS.SELL}
    ]


def run_hikyuu_backtest(config: HikyuuBacktestConfig) -> dict[str, Any]:
    """Execute an EMA portfolio against a verified immutable Hikyuu snapshot.

    Results remain exploratory until historic trading restrictions are verified.
    """

    start, end = validate_backtest_config(config)
    snapshot_dir, manifest = verify_snapshot(active_snapshot_root(), config.snapshot_id)

    import hikyuu as h  # pylint: disable=import-outside-toplevel

    codes = [market_code(symbol) for symbol in config.symbols]
    h.load_hikyuu(
        config_file=str(snapshot_dir / "hikyuu.ini"),
        stock_list=[*codes, "sh000001"],
        ktype_list=["day"],
        load_history_finance=False,
        load_weight=True,
        start_spot=False,
    )
    query = h.Query(
        h.Datetime(start.isoformat()),
        h.Datetime((end + timedelta(days=1)).isoformat()),
        h.Query.DAY,
    )
    stocks, coverage = _checked_stocks(
        h, codes, query, slow_period=config.slow_period, start=start, end=end
    )
    account = _execute_portfolio(h, config, stocks, query, start)
    calendar = h.sm.get_trading_calendar(query, "SH")
    equity_curve = _equity_curve(calendar, account.get_funds_list(calendar))
    trades = _trade_records(h, account)
    if not equity_curve:
        raise HikyuuDataError("Hikyuu produced no daily account values")
    final_assets = equity_curve[-1]["total_assets"]
    return {
        "status": "exploratory",
        "engine": "hikyuu",
        "hikyuu_version": manifest["hikyuu_version"],
        "snapshot_id": manifest["snapshot_id"],
        "config": asdict(config),
        "coverage": coverage,
        "equity_curve": equity_curve,
        "trades": trades,
        "metrics": {"total_return": final_assets / config.initial_cash - 1},
        "unverified_constraints": [
            "historical_st",
            "historical_suspension",
            "daily_price_limits",
            "t_plus_one",
            "slippage",
            "point_in_time_universe",
            "corporate_action_accounting",
        ],
    }
