"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bell,
  CandlestickChart,
  Clock3,
  Info,
  Layers3,
  Newspaper,
  Plus,
  Search,
  Star,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { KlineChart } from "@/components/kline-chart";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  changeColorClass,
  cn,
  formatAmount,
  formatChange,
  formatMetric,
  formatNumber,
} from "@/lib/market-format";
import { formatNewsTime, sortNewsByTimeDesc } from "@/lib/news-utils";
import type {
  ChartMode,
  DetailState,
  FinancialMetrics,
  HotKeyword,
  KlinePoint,
  MarketIndex,
  NewsItem,
  OrderBookData,
  Quote,
  QuoteCacheEntry,
  StockSearchResult,
  TradePrint,
} from "@/lib/market-types";

type WatchlistPanelProps = {
  query: string;
  watchlist: string[];
  selectedSymbol: string;
  quoteCache: Record<string, QuoteCacheEntry>;
  lookupQuote: Quote | null;
  lookupStatus: "idle" | "loading" | "ready" | "error";
  searchResults: StockSearchResult[];
  searchStatus: "idle" | "loading" | "ready" | "error";
  onQueryChange: (query: string) => void;
  onSelect: (symbol: string) => void;
  onAdd: (symbol: string) => void;
  onRemove: (symbol: string) => void;
};

export function WatchlistPanel({
  query,
  watchlist,
  selectedSymbol,
  quoteCache,
  lookupQuote,
  lookupStatus,
  searchResults,
  searchStatus,
  onQueryChange,
  onSelect,
  onAdd,
  onRemove,
}: WatchlistPanelProps) {
  const filteredResults = searchResults
    .filter((stock) => stock.symbol !== lookupQuote?.symbol)
    .slice(0, 8);

  return (
    <aside className="border-b border-white/10 bg-[#0c1117] xl:border-b-0 xl:border-r">
      <div className="flex h-full flex-col">
        <div className="border-b border-white/10 px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg border border-emerald-400/40 bg-emerald-400/10 text-emerald-300">
              <CandlestickChart size={21} />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-wide">QuantDash</h1>
              <p className="font-mono text-xs text-slate-500">Python Market Workbench</p>
            </div>
          </div>
        </div>

        <div className="px-5 py-4">
          <label className="relative block">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="搜索股票代码 / 名称 / 拼音"
              className="h-10 w-full rounded-md border border-white/10 bg-black/30 pl-9 pr-3 text-sm outline-none transition focus:border-emerald-400/70"
            />
          </label>

          {query && (
            <div className="mt-2 max-h-72 overflow-y-auto rounded-md border border-white/10 bg-[#111821]">
              {filteredResults.map((stock) => {
                const quote = quoteCache[stock.symbol]?.quote;
                return (
                  <SearchResultButton
                    key={stock.symbol}
                    stock={stock}
                    quote={quote}
                    onAdd={() => onAdd(stock.symbol)}
                  />
                );
              })}

              {searchStatus === "loading" && (
                <div className="px-3 py-2 text-sm text-slate-500">正在查询股票搜索数据源</div>
              )}
              {searchStatus === "error" && (
                <div className="px-3 py-2 text-sm text-red-300">股票搜索数据源暂不可用</div>
              )}
              {lookupStatus === "loading" && (
                <div className="px-3 py-2 text-sm text-slate-500">正在查询真实行情</div>
              )}
              {lookupStatus === "error" && (
                <div className="px-3 py-2 text-sm text-red-300">未找到该代码或行情源暂不可用</div>
              )}
              {lookupStatus === "ready" && lookupQuote && (
                <SearchResultButton
                  stock={{ symbol: lookupQuote.symbol, name: lookupQuote.name }}
                  quote={lookupQuote}
                  onAdd={() => onAdd(lookupQuote.symbol)}
                />
              )}
              {lookupStatus === "idle" && filteredResults.length === 0 && searchStatus !== "loading" && (
                <div className="px-3 py-2 text-sm text-slate-500">
                  继续输入代码，满 6 位后查询真实行情
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 px-3 pb-5">
          <div className="mb-2 flex items-center justify-between px-2 text-xs uppercase tracking-[0.18em] text-slate-500">
            <span>Watchlist</span>
            <Star size={14} />
          </div>
          <div className="space-y-2">
            {watchlist.map((symbol) => (
              <WatchlistItem
                key={symbol}
                symbol={symbol}
                selected={selectedSymbol === symbol}
                entry={quoteCache[symbol]}
                onSelect={() => onSelect(symbol)}
                onRemove={() => onRemove(symbol)}
              />
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

function SearchResultButton({
  stock,
  quote,
  onAdd,
}: {
  stock: StockSearchResult;
  quote?: Quote | null;
  onAdd: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-white/5"
    >
      <span className="min-w-0">
        <span className="font-medium">{quote?.name ?? stock.name}</span>
        <span className="ml-2 font-mono text-xs text-slate-500">{stock.symbol}</span>
        {quote && (
          <span
            className={cn(
              "ml-2 font-mono text-xs",
              changeColorClass(quote.change_rate),
            )}
          >
            {formatNumber(quote.current_price)} / {formatChange(quote.change_rate)}
          </span>
        )}
      </span>
      <Plus size={15} className="shrink-0 text-emerald-300" />
    </button>
  );
}

function WatchlistItem({
  symbol,
  selected,
  entry,
  onSelect,
  onRemove,
}: {
  symbol: string;
  selected: boolean;
  entry?: QuoteCacheEntry;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const quote = entry?.quote;
  const change = quote?.change_rate;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          onSelect();
        }
      }}
      className={cn(
        "group w-full cursor-pointer rounded-md border px-3 py-3 text-left transition",
        selected
          ? "border-emerald-400/50 bg-emerald-400/10"
          : "border-white/8 bg-white/3 hover:border-white/18 hover:bg-white/6",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium">{quote?.name ?? symbol}</div>
          <div className="mt-1 font-mono text-xs text-slate-500">
            {symbol}
            {entry?.status === "stale" && <span className="ml-2 text-amber-300">stale</span>}
            {entry?.status === "loading" && !quote && (
              <span className="ml-2 text-slate-400">查询中</span>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-sm">{formatNumber(quote?.current_price)}</div>
          <div className={cn("mt-1 font-mono text-xs", changeColorClass(change))}>
            {formatChange(change)}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <span>成交额 {formatAmount(quote?.turnover)}</span>
        <span>量 {formatAmount(quote?.volume)}</span>
      </div>
      {entry?.status === "error" && quote && <div className="mt-2 text-xs text-red-300">行情暂不可用</div>}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
        className="mt-2 text-xs text-slate-600 opacity-0 transition hover:text-slate-300 group-hover:opacity-100"
      >
        移除
      </button>
    </div>
  );
}

export function MarketIndexTicker({
  indexes,
  dataStatus,
}: {
  indexes: MarketIndex[];
  dataStatus: string;
}) {
  return (
    <header className="border-b border-white/10 bg-[#0c1117]/95 px-5 py-3 backdrop-blur">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3 overflow-x-auto">
          {indexes.map((item) => (
            <div
              key={item.name}
              className="flex shrink-0 items-center gap-2 rounded-md border border-white/10 bg-white/3 px-3 py-2"
            >
              <span className="text-sm text-slate-400">{item.name}</span>
              <span className="font-mono text-sm">{formatNumber(item.value)}</span>
              <span className={cn("font-mono text-xs", changeColorClass(item.change_rate))}>
                {formatChange(item.change_rate)}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <Activity size={15} className="text-emerald-300" />
            <span>{dataStatus} · Quote 10s / Index 30s 轮询</span>
          </div>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

export function StockHeader({
  symbol,
  quote,
  quoteStatus,
  mode,
  onModeChange,
}: {
  symbol: string;
  quote?: Quote | null;
  quoteStatus?: QuoteCacheEntry["status"];
  mode: ChartMode;
  onModeChange: (mode: ChartMode) => void;
}) {
  const change = quote?.change_rate;

  return (
    <div className="flex flex-col gap-4 border-b border-white/10 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold">{quote?.name ?? symbol}</h2>
          <span className="rounded border border-white/10 px-2 py-1 font-mono text-xs text-slate-400">
            {symbol}
          </span>
          {quoteStatus === "stale" && (
            <span className="rounded border border-amber-300/30 px-2 py-1 text-xs text-amber-300">旧数据</span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <span className="font-mono text-3xl">{formatNumber(quote?.current_price)}</span>
          <span className={cn("flex items-center gap-1 font-mono text-sm", changeColorClass(change))}>
            {(change ?? 0) >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            {formatChange(change)}
          </span>
          <span className="text-sm text-slate-500">
            最高 {formatNumber(quote?.high)} / 最低 {formatNumber(quote?.low)}
          </span>
          {quote?.trade_time && <span className="text-sm text-slate-500">{quote.trade_date} {quote.trade_time}</span>}
        </div>
      </div>
      <div className="inline-flex w-fit rounded-md border border-white/10 bg-black/25 p-1">
        {[
          ["1min", "分时"],
          ["5day", "五日"],
          ["daily", "日线"],
          ["weekly", "周线"],
          ["monthly", "月线"],
          ["yearly", "年线"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => onModeChange(value as ChartMode)}
            className={cn(
              "rounded px-3 py-1.5 text-sm transition",
              mode === value ? "bg-emerald-400 text-black" : "text-slate-400 hover:text-slate-100",
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function KlinePanel({
  data,
  status,
  mode,
  previousClose,
}: {
  data: KlinePoint[];
  status: string;
  mode: ChartMode;
  previousClose?: number | null;
}) {
  return (
    <div className="h-[430px] px-2 py-3">
      {data.length > 0 ? (
        <KlineChart data={data} mode={mode} previousClose={previousClose} />
      ) : (
        <EmptyState
          icon={<Clock3 size={18} />}
          title={status === "error" ? "K 线数据暂不可用" : "正在加载真实 K 线数据"}
          description="行情源异常时保留页面结构，不输出虚假走势。"
        />
      )}
    </div>
  );
}

export function HotNewsPanel({ hotNews }: { hotNews: DetailState<NewsItem[]> }) {
  return (
    <NewsSection
      title="热点新闻"
      sourceLabel="全市场"
      icon={<Newspaper size={18} />}
      state={hotNews}
    />
  );
}

export function NewsAnnouncementPanel({
  news,
  announcements,
}: {
  news: DetailState<NewsItem[]>;
  announcements: DetailState<NewsItem[]>;
}) {
  return (
    <div className="space-y-4">
      <NewsSection
        title="个股新闻"
        sourceLabel="当前标的"
        icon={<Bell size={18} />}
        state={news}
      />
      <NewsSection
        title="公告"
        sourceLabel="交易所披露"
        icon={<Info size={18} />}
        state={announcements}
      />
    </div>
  );
}

function NewsSection({
  title,
  sourceLabel,
  icon,
  state,
}: {
  title: string;
  sourceLabel: string;
  icon: ReactNode;
  state: DetailState<NewsItem[]>;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-white/10 bg-[#0d131a]">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-emerald-300">{icon}</span>
          <h3 className="font-medium">{title}</h3>
        </div>
        <span className="shrink-0 rounded border border-white/10 px-2 py-1 text-xs text-slate-500">
          {sourceLabel}
        </span>
      </div>
      <ArticleList label={title} state={state} />
    </section>
  );
}

function ArticleList({ label, state }: { label: string; state: DetailState<NewsItem[]> }) {
  if (state.data.length === 0) {
    return (
      <div className="px-4 py-5">
        <EmptyInline title={emptyNewsTitle(label, state)} description={emptyNewsDescription(state)} />
      </div>
    );
  }

  const sorted = sortNewsByTimeDesc(state.data);

  return (
    <div className="divide-y divide-white/10">
      {sorted.map((item) => (
        <article
          key={`${label}-${item.time ?? item.rank ?? item.published_at}-${item.title}`}
          className="grid gap-2 px-4 py-3 sm:grid-cols-[180px_112px_minmax(0,1fr)]"
        >
          <time className="whitespace-nowrap font-mono text-sm text-slate-500">
            {formatNewsTime(item)}
          </time>
          <span className="truncate text-sm text-slate-400">{item.source_name ?? item.source ?? label}</span>
          {item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 text-sm text-slate-200 transition hover:text-emerald-300"
            >
              {item.title}
            </a>
          ) : (
            <h4 className="min-w-0 text-sm text-slate-200">{item.title}</h4>
          )}
        </article>
      ))}
    </div>
  );
}

function emptyNewsTitle(label: string, state: DetailState<NewsItem[]>) {
  if (state.status === "loading") {
    return `正在加载${label}`;
  }
  if (state.status === "error") {
    return `${label}暂不可用`;
  }
  if (state.source === "not_configured") {
    return `${label}数据未接入`;
  }
  return `暂无${label}`;
}

function emptyNewsDescription(state: DetailState<NewsItem[]>) {
  if (state.status === "loading") {
    return "正在从真实数据源同步。";
  }
  if (state.status === "error") {
    return state.message ?? "数据接口短暂异常，稍后会自动刷新。";
  }
  if (state.source === "not_configured") {
    return "等待 data-center 提供真实数据源。";
  }
  return "当前数据源暂未返回相关内容。";
}

export function OrderBookPanel({
  orderBook,
  trades,
}: {
  orderBook: DetailState<OrderBookData>;
  trades: DetailState<TradePrint[]>;
}) {
  const hasOrderBook = orderBook.data.asks.length > 0 || orderBook.data.bids.length > 0;

  return (
    <div className="rounded-lg border border-white/10 bg-[#0d131a]">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <BarChart3 size={18} className="text-emerald-300" />
        <h3 className="font-medium">盘口与逐笔</h3>
      </div>
      {hasOrderBook ? (
        <div className="grid gap-4 p-4 text-sm">
          <OrderBookSide levels={orderBook.data.asks} tone="sell" />
          <OrderBookSide levels={orderBook.data.bids} tone="buy" />
        </div>
      ) : (
        <div className="p-4">
          <EmptyInline title="五档盘口未接入" description="当前数据源没有返回真实盘口。" />
        </div>
      )}
      <div className="border-t border-white/10 px-4 py-3">
        {trades.data.length > 0 ? (
          trades.data.map((trade) => (
            <div key={`${trade.time}-${trade.price}`} className="grid grid-cols-4 gap-2 py-1 font-mono text-xs text-slate-400">
              <span>{trade.time}</span>
              <span className={trade.side === "买入" ? "text-red-300" : "text-emerald-300"}>{formatNumber(trade.price)}</span>
              <span>{formatAmount(trade.volume)}</span>
              <span>{trade.side}</span>
            </div>
          ))
        ) : (
          <EmptyInline title="逐笔成交未接入" description="不使用模拟逐笔数据。" />
        )}
      </div>
    </div>
  );
}

function OrderBookSide({
  levels,
  tone,
}: {
  levels: OrderBookData["asks"];
  tone: "sell" | "buy";
}) {
  const color = tone === "sell" ? "text-red-300/90" : "text-emerald-300/90";

  return (
    <div className="space-y-1">
      {levels.map((level) => (
        <div
          key={level.level}
          className={cn(
            "grid grid-cols-[2.75rem_minmax(5.5rem,1fr)_5rem] items-center gap-2 whitespace-nowrap font-mono",
            color,
          )}
        >
          <span className="min-w-0">{level.level}</span>
          <span className="min-w-0 text-right tabular-nums">{formatNumber(level.price)}</span>
          <span className="min-w-0 overflow-hidden text-ellipsis text-right tabular-nums text-slate-400">
            {formatAmount(level.volume)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function FinancialSummaryPanel({
  quote,
  financials,
}: {
  quote?: Quote | null;
  financials: DetailState<FinancialMetrics>;
}) {
  const data = financials.data;
  const pe = data.pe_ttm ?? quote?.pe_ttm ?? null;
  const pb = data.pb ?? quote?.pb ?? null;
  const roe = data.roe ?? null;
  const grossMargin = data.gross_margin ?? null;
  const watermark = typeof pe === "number" ? Math.min(Math.round(pe), 95) : 0;
  const periodLabel = data.report_period ?? data.trade_date ?? null;
  const isIdle = financials.status === "idle";

  return (
    <section className="rounded-lg border border-white/10 bg-white/3">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <WalletCards size={18} className="text-emerald-300" />
        <h3 className="font-medium">财务估值卡片</h3>
        {periodLabel && (
          <span className="ml-auto rounded border border-white/10 px-2 py-1 font-mono text-xs text-slate-500">
            {periodLabel}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 p-4">
        {[
          ["PE TTM", formatMetric(pe)],
          ["PB", formatMetric(pb)],
          ["ROE", formatMetric(roe, "%")],
          ["毛利率", formatMetric(grossMargin, "%")],
          ["营收同比", formatMetric(data.revenue_yoy, "%")],
          ["净利同比", formatMetric(data.netprofit_yoy, "%")],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-white/10 bg-black/25 p-3">
            <div className="text-xs text-slate-500">{label}</div>
            <div className="mt-2 font-mono text-xl">{value}</div>
          </div>
        ))}
      </div>
      <div className="px-4 pb-4">
        <div className="mb-2 flex justify-between text-xs text-slate-500">
          <span>估值水位</span>
          <span>{watermark || "--"}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-emerald-300" style={{ width: `${watermark}%` }} />
        </div>
        {!pe && !pb && !roe ? (
          <p className="mt-3 text-xs text-slate-500">财务数据源暂未返回结果，不生成估值判断。</p>
        ) : null}
        {isIdle && (
          <p className="mt-1 text-xs text-slate-500">数据源 AkShare 财务估值指标</p>
        )}
      </div>
    </section>
  );
}

export function SentimentHotwordsPanel({ hotKeywords }: { hotKeywords: DetailState<HotKeyword[]> }) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/3">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <Bell size={18} className="text-emerald-300" />
        <h3 className="font-medium">全网舆情热度</h3>
      </div>
      {hotKeywords.data.length > 0 ? (
        <div className="flex flex-wrap gap-2 p-4">
          {hotKeywords.data.map((item) => (
            <span
              key={item.word}
              className="rounded-md border border-white/10 px-2.5 py-1.5 font-mono text-sm"
              style={{
                color: item.heat > 80 ? "#fca5a5" : item.heat > 65 ? "#fde68a" : "#8ddfcb",
                background: `rgba(255,255,255,${item.heat / 900})`,
                fontSize: `${12 + item.heat / 18}px`,
              }}
            >
              {item.word}
            </span>
          ))}
        </div>
      ) : (
        <div className="p-4">
          <EmptyInline title="舆情热词未接入" description="等待真实舆情数据源，不展示模拟热词。" />
        </div>
      )}
    </section>
  );
}

export function NewsCenterEntryPanel() {
  return (
    <section className="rounded-lg border border-white/10 bg-white/3 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Newspaper size={18} className="text-emerald-300" />
        <h3 className="font-medium">新闻中心</h3>
      </div>
      <p className="text-sm text-slate-500">查看全市场热点新闻，按来源与时间快速扫描市场情绪。</p>
      <Link
        href="/news"
        className="mt-4 inline-flex w-full items-center justify-between rounded-md border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-200 transition hover:border-emerald-300/60 hover:bg-emerald-300/15"
      >
        <span>进入 News page</span>
        <ArrowRight size={16} />
      </Link>
    </section>
  );
}

export function StrategyObservationPanel() {
  return (
    <section className="rounded-lg border border-white/10 bg-white/3 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-medium">策略观察</h3>
        <span className="rounded bg-emerald-300/10 px-2 py-1 text-xs text-emerald-300">Real API</span>
      </div>
      <div className="space-y-3 text-sm text-slate-400">
        <p>价格、涨跌幅、指数、K 线和五档盘口通过 BFF 转发到 Python 数据服务。</p>
        <p>新闻、公告、逐笔、舆情和财务缺失时使用空状态，避免用 mock 数据制造结论。</p>
      </div>
      <Link
        href="/universes"
        className="mt-4 inline-flex w-full items-center justify-between rounded-md border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-200 transition hover:border-emerald-300/60 hover:bg-emerald-300/15"
      >
        <span className="inline-flex items-center gap-2">
          <Layers3 size={15} />
          Universe Center
        </span>
        <ArrowRight size={16} />
      </Link>
      <Link
        href="/backtests"
        className="mt-2 inline-flex w-full items-center justify-between rounded-md border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-200 transition hover:border-emerald-300/60 hover:bg-emerald-300/15"
      >
        <span>历史回测（研究预览）</span>
        <ArrowRight size={16} />
      </Link>
    </section>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="grid h-full place-items-center text-center">
      <div className="max-w-sm rounded-md border border-white/10 bg-black/20 px-5 py-4">
        <div className="mx-auto mb-3 grid size-9 place-items-center rounded-md border border-white/10 text-slate-400">
          {icon}
        </div>
        <div className="font-medium text-slate-300">{title}</div>
        <p className="mt-2 text-sm text-slate-500">{description}</p>
      </div>
    </div>
  );
}

function EmptyInline({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex gap-3 rounded-md border border-white/10 bg-black/20 p-3 text-sm">
      <Info size={16} className="mt-0.5 shrink-0 text-slate-500" />
      <div>
        <div className="text-slate-300">{title}</div>
        <div className="mt-1 text-slate-500">{description}</div>
      </div>
    </div>
  );
}
