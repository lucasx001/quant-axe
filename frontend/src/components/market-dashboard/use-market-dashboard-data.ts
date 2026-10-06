"use client";

import { useDeferredValue, useEffect, useMemo } from "react";
import { keepPreviousData, useQueries, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api-client";
import { WATCHLIST_STORAGE_KEY, useMarketStore } from "@/stores/market-store";
import type {
  ChartMode,
  DetailState,
  FinancialMetrics,
  HotKeyword,
  KlinePoint,
  MarketIndex,
  NewsAnalysis,
  NewsAnalysisState,
  NewsItem,
  OrderBookData,
  Quote,
  QuoteCacheEntry,
  StockSearchResult,
  TradePrint,
} from "@/lib/market-types";

const QUOTE_POLL_INTERVAL_MS = 5_000;
const HOT_NEWS_POLL_INTERVAL_MS = 5_000;
const NEWS_ANALYSIS_POLL_INTERVAL_MS = 30_000;

const initialIndexes: MarketIndex[] = [
  { symbol: "000001", name: "上证指数", value: null, change_rate: null },
  { symbol: "399001", name: "深证成指", value: null, change_rate: null },
  { symbol: "399006", name: "创业板指", value: null, change_rate: null },
  { symbol: "000688", name: "科创50", value: null, change_rate: null },
];

type MarketSnapshotPayload = {
  quotes: { data: Quote[]; failed?: Array<{ symbol: string; error: string }> };
  indexes: { data: MarketIndex[] };
};

type SnapshotData = {
  quoteCache: Record<string, QuoteCacheEntry>;
  indexes: MarketIndex[];
};

type SourcePayload<T> = {
  data: T;
  source?: string;
  status?: string;
  message?: string;
};

type HotNewsPayload = SourcePayload<NewsItem[]> & {
  stale?: boolean;
  snapshot_date?: string;
  snapshot_crawl_time?: string;
};

export function useWatchlistPersistence() {
  const hydrateWatchlist = useMarketStore((state) => state.hydrateWatchlist);
  const watchlist = useMarketStore((state) => state.watchlist);

  useEffect(() => {
    const stored = window.localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as string[];
      if (Array.isArray(parsed)) hydrateWatchlist(parsed);
    } catch {
      window.localStorage.removeItem(WATCHLIST_STORAGE_KEY);
    }
  }, [hydrateWatchlist]);

  useEffect(() => {
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchlist));
  }, [watchlist]);
}

export function useStockLookup(input: string) {
  const deferred = useDeferredValue(input.trim());
  const symbol = deferred.replace(/\D/g, "").slice(0, 6);
  const search = useQuery({
    queryKey: ["stocks", "search", deferred],
    queryFn: ({ signal }) => apiRequest<{ data: StockSearchResult[] }>(
      `/api/stocks/search?q=${encodeURIComponent(deferred)}`, { signal },
    ),
    enabled: deferred.length > 0,
    staleTime: 60_000,
  });
  const lookup = useQuery({
    queryKey: ["stock", "quote", symbol],
    queryFn: ({ signal }) => apiRequest<Quote>(`/api/stock/quote/${symbol}`, { signal }),
    enabled: symbol.length === 6,
    staleTime: 10_000,
  });
  return {
    results: search.data?.data ?? [],
    searchStatus: !deferred ? "idle" as const : search.isError ? "error" as const
      : search.isPending ? "loading" as const : "ready" as const,
    lookupQuote: symbol.length === 6 ? lookup.data ?? null : null,
    lookupStatus: symbol.length !== 6 ? "idle" as const : lookup.isError ? "error" as const
      : lookup.isPending ? "loading" as const : "ready" as const,
  };
}

export function useMarketSnapshot(symbols: string[]) {
  const queryClient = useQueryClient();
  const symbolKey = symbols.join(",");
  const queryKey = ["market", "snapshot", symbolKey] as const;
  const snapshot = useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      const payload = await apiRequest<MarketSnapshotPayload>(
        `/api/market/snapshot?${new URLSearchParams({ symbols: symbolKey })}`,
        { signal },
      );
      const previous = queryClient.getQueryData<SnapshotData>(queryKey);
      const received = new Map(payload.quotes.data.map((quote) => [quote.symbol, quote]));
      const quoteCache: Record<string, QuoteCacheEntry> = {};
      for (const symbol of symbols) {
        const quote = received.get(symbol);
        const old = previous?.quoteCache[symbol];
        quoteCache[symbol] = quote
          ? { quote, status: "ready", updatedAt: new Date().toISOString(), error: null }
          : {
              quote: old?.quote ?? null,
              status: old?.quote ? "stale" : "error",
              updatedAt: old?.updatedAt ?? null,
              error: "行情源暂不可用",
            };
      }
      return { quoteCache, indexes: payload.indexes.data ?? previous?.indexes ?? initialIndexes };
    },
    refetchInterval: QUOTE_POLL_INTERVAL_MS,
    placeholderData: keepPreviousData,
  });
  const quoteCache = useMemo(() => {
    const entries = snapshot.data?.quoteCache ?? {};
    if (!snapshot.isError) return entries;
    return Object.fromEntries(Object.entries(entries).map(([symbol, entry]) => [
      symbol,
      { ...entry, status: entry.quote ? "stale" as const : "error" as const },
    ]));
  }, [snapshot.data, snapshot.isError]);
  return {
    quoteCache,
    indexes: snapshot.data?.indexes ?? initialIndexes,
    dataStatus: snapshot.isError ? "行情源暂不可用，保留最近一次数据"
      : snapshot.isPending ? "连接 Python 行情源中" : "Python 实时行情 · AkShare",
  };
}

export function useKlineData(symbol: string, mode: ChartMode) {
  const query = useQuery({
    queryKey: ["stock", "kline", symbol, mode],
    queryFn: ({ signal }) => apiRequest<{ data: KlinePoint[] }>(
      `/api/stock/kline/${symbol}?type=${mode}`, { signal },
    ),
    enabled: symbol.length === 6,
    staleTime: 30_000,
  });
  return {
    data: query.data?.data ?? [],
    status: query.isError ? "error" as const : query.isPending ? "loading" as const
      : query.data?.data.length ? "ready" as const : "idle" as const,
  };
}

export function useHotNews(limit = 30) {
  const query = useQuery({
    queryKey: ["news", "hot", limit],
    queryFn: ({ signal }) => apiRequest<HotNewsPayload>(`/api/news/hot?limit=${limit}`, { signal }),
    refetchInterval: HOT_NEWS_POLL_INTERVAL_MS,
  });
  const payload = query.data;
  return {
    status: query.isError || payload?.status === "unavailable" ? "error" as const
      : query.isPending ? "loading" as const
      : payload?.data.length ? "ready" as const : "empty" as const,
    data: payload?.data ?? [],
    source: payload?.source,
    stale: payload?.stale,
    snapshot_date: payload?.snapshot_date,
    snapshot_crawl_time: payload?.snapshot_crawl_time,
    message: query.isError ? "热点新闻接口暂不可用" : payload?.message,
  };
}

export function useNewsAnalysis(): NewsAnalysisState {
  const query = useQuery({
    queryKey: ["news", "analysis", "latest"],
    queryFn: ({ signal }) => apiRequest<{
      status: "ready" | "waiting" | "unavailable";
      stale?: boolean;
      data: NewsAnalysis | null;
      message?: string;
    }>("/api/news/analysis/latest", { signal }),
    refetchInterval: NEWS_ANALYSIS_POLL_INTERVAL_MS,
  });
  if (query.isError) {
    return { status: "error", data: query.data?.data ?? null, message: query.error.message };
  }
  if (!query.data) return { status: "loading", data: null };
  return {
    status: query.data.status === "unavailable" ? "error" : query.data.status,
    data: query.data.data,
    stale: query.data.stale,
    message: query.data.message,
  };
}

function arrayState<T>(query: UseQueryResult<SourcePayload<T[]>, Error>): DetailState<T[]> {
  if (query.isError) return { status: "error", data: query.data?.data ?? [], message: "数据接口暂不可用" };
  if (!query.data) return { status: "loading", data: [] };
  if (query.data.status === "unavailable" && query.data.source !== "not_configured") {
    return { status: "error", data: [], source: query.data.source, message: query.data.message };
  }
  return {
    status: query.data.data.length ? "ready" : "empty",
    data: query.data.data,
    source: query.data.source,
    message: query.data.message,
  };
}

function objectState<T>(query: UseQueryResult<SourcePayload<T>, Error>, fallback: T): DetailState<T> {
  if (query.isError) return { status: "error", data: query.data?.data ?? fallback, message: "数据接口暂不可用" };
  if (!query.data) return { status: "loading", data: fallback };
  if (query.data.status === "unavailable" || query.data.status === "not_configured") {
    return { status: "error", data: fallback, source: query.data.source, message: query.data.message };
  }
  return { status: "ready", data: query.data.data ?? fallback, source: query.data.source };
}

export function useMarketDetails(symbol: string) {
  const [orderBook, trades, news, announcements, financials, hotKeywords] = useQueries({
    queries: [
      {
        queryKey: ["stock", symbol, "order-book"],
        queryFn: ({ signal }) => apiRequest<SourcePayload<OrderBookData>>(`/api/stock/order-book/${symbol}`, { signal }),
      },
      {
        queryKey: ["stock", symbol, "trades"],
        queryFn: ({ signal }) => apiRequest<SourcePayload<TradePrint[]>>(`/api/stock/trades/${symbol}`, { signal }),
      },
      {
        queryKey: ["stock", symbol, "news"],
        queryFn: ({ signal }) => apiRequest<SourcePayload<NewsItem[]>>(`/api/stock/news/${symbol}`, { signal }),
      },
      {
        queryKey: ["stock", symbol, "announcements"],
        queryFn: ({ signal }) => apiRequest<SourcePayload<NewsItem[]>>(`/api/stock/announcements/${symbol}`, { signal }),
      },
      {
        queryKey: ["stock", symbol, "financials"],
        queryFn: ({ signal }) => apiRequest<SourcePayload<FinancialMetrics>>(`/api/stock/financials/${symbol}`, { signal }),
      },
      {
        queryKey: ["intelligence", "hot-keywords"],
        queryFn: ({ signal }) => apiRequest<SourcePayload<HotKeyword[]>>("/api/intelligence/hot-keywords", { signal }),
        refetchInterval: 60_000,
      },
    ],
  });
  return {
    orderBook: objectState(orderBook, { asks: [], bids: [] }),
    trades: arrayState(trades),
    news: arrayState(news),
    announcements: arrayState(announcements),
    financials: objectState(financials, { pe_ttm: null, pb: null, roe: null, gross_margin: null }),
    hotKeywords: arrayState(hotKeywords),
  };
}
