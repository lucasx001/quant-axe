"use client";

import { useMemo } from "react";
import {
  FinancialSummaryPanel,
  KlinePanel,
  MarketIndexTicker,
  NewsCenterEntryPanel,
  NewsAnnouncementPanel,
  OrderBookPanel,
  SentimentHotwordsPanel,
  StockHeader,
  StrategyObservationPanel,
  WatchlistPanel,
} from "@/components/market-dashboard/dashboard-parts";
import {
  useKlineData,
  useMarketDetails,
  useMarketSnapshot,
  useStockLookup,
  useWatchlistPersistence,
} from "@/components/market-dashboard/use-market-dashboard-data";
import { useMarketStore } from "@/stores/market-store";

export function QuantDashboard() {
  const {
    query,
    selectedSymbol,
    watchlist,
    mode,
    setQuery,
    setSelectedSymbol,
    setMode,
    addStock,
    removeStock,
  } = useMarketStore();

  useWatchlistPersistence();
  const symbols = useMemo(() => Array.from(new Set([selectedSymbol, ...watchlist])), [selectedSymbol, watchlist]);
  const { quoteCache, indexes, dataStatus } = useMarketSnapshot(symbols);
  const { data: chartData, status: chartStatus } = useKlineData(selectedSymbol, mode);
  const { results: searchResults, searchStatus, lookupQuote, lookupStatus } = useStockLookup(query);
  const details = useMarketDetails(selectedSymbol);
  const selectedQuoteEntry = quoteCache[selectedSymbol];
  const selectedQuote = selectedQuoteEntry?.quote
    ?? (lookupQuote?.symbol === selectedSymbol ? lookupQuote : null);

  return (
    <main className="min-h-screen bg-[#080a0d] text-slate-100">
      <div className="flex min-h-screen flex-col xl:grid xl:grid-cols-[300px_minmax(0,1fr)_330px]">
        <WatchlistPanel
          query={query}
          watchlist={watchlist}
          selectedSymbol={selectedSymbol}
          quoteCache={quoteCache}
          lookupQuote={lookupQuote}
          lookupStatus={lookupStatus}
          searchResults={searchResults}
          searchStatus={searchStatus}
          onQueryChange={setQuery}
          onSelect={setSelectedSymbol}
          onAdd={addStock}
          onRemove={removeStock}
        />

        <section className="min-w-0 bg-[#080a0d]">
          <MarketIndexTicker indexes={indexes} dataStatus={dataStatus} />

          <div className="space-y-4 p-4 lg:p-5">
            <section className="rounded-lg border border-white/10 bg-[#0d131a]">
              <StockHeader
                symbol={selectedSymbol}
                quote={selectedQuote}
                quoteStatus={selectedQuoteEntry?.status}
                mode={mode}
                onModeChange={setMode}
              />
              <KlinePanel
                data={chartData}
                status={chartStatus}
                mode={mode}
                previousClose={selectedQuote?.previous_close}
              />
            </section>

            <section className="grid gap-4 lg:grid-cols-[1fr_300px]">
              <NewsAnnouncementPanel
                news={details.news}
                announcements={details.announcements}
              />
              <OrderBookPanel orderBook={details.orderBook} trades={details.trades} />
            </section>
          </div>
        </section>

        <aside className="border-t border-white/10 bg-[#0c1117] xl:border-l xl:border-t-0">
          <div className="space-y-4 p-4">
            <NewsCenterEntryPanel />
            <StrategyObservationPanel />
            <FinancialSummaryPanel quote={selectedQuote} financials={details.financials} />
            <SentimentHotwordsPanel hotKeywords={details.hotKeywords} />
          </div>
        </aside>
      </div>
    </main>
  );
}
