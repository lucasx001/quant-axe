import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SYMBOL, useMarketStore } from "@/stores/market-store";

beforeEach(() => {
  useMarketStore.setState({
    selectedSymbol: DEFAULT_SYMBOL,
    watchlist: [DEFAULT_SYMBOL],
    query: "",
    mode: "daily",
  });
});

describe("watchlist UI state", () => {
  it("deduplicates saved symbols and selects the first valid code", () => {
    useMarketStore.getState().hydrateWatchlist(["600519", "600519", "abc", "300750"]);
    expect(useMarketStore.getState().watchlist).toEqual(["600519", "300750"]);
    expect(useMarketStore.getState().selectedSymbol).toBe("600519");
  });

  it("adds a code once and keeps the selection on a remaining code after removal", () => {
    useMarketStore.getState().addStock("300750");
    useMarketStore.getState().addStock("300750");
    expect(useMarketStore.getState().watchlist).toEqual(["300750", "600519"]);
    useMarketStore.getState().removeStock("300750");
    expect(useMarketStore.getState().selectedSymbol).toBe("600519");
  });

  it("keeps a fallback stock when the last watchlist entry is removed", () => {
    useMarketStore.getState().removeStock(DEFAULT_SYMBOL);
    expect(useMarketStore.getState().watchlist).toEqual([DEFAULT_SYMBOL]);
  });
});
