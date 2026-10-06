import { create } from "zustand";
import type { ChartMode } from "@/lib/market-types";

export const DEFAULT_SYMBOL = "600519";
export const WATCHLIST_STORAGE_KEY = "quantdash.watchlist.v1";

type MarketStore = {
  query: string;
  selectedSymbol: string;
  watchlist: string[];
  mode: ChartMode;
  setQuery: (query: string) => void;
  setSelectedSymbol: (symbol: string) => void;
  setMode: (mode: ChartMode) => void;
  hydrateWatchlist: (symbols: string[]) => void;
  addStock: (symbol: string) => void;
  removeStock: (symbol: string) => void;
};

function normalizeSymbol(symbol: string) {
  return symbol.replace(/\D/g, "").slice(0, 6);
}

function dedupeSymbols(symbols: string[]) {
  return Array.from(new Set(symbols.map(normalizeSymbol).filter((symbol) => symbol.length === 6)));
}

export const useMarketStore = create<MarketStore>((set) => ({
  query: "",
  selectedSymbol: DEFAULT_SYMBOL,
  watchlist: ["600519", "300750", "688981"],
  mode: "daily",
  setQuery: (query) => set({ query }),
  setSelectedSymbol: (symbol) => {
    const normalized = normalizeSymbol(symbol);
    if (normalized.length === 6) set({ selectedSymbol: normalized });
  },
  setMode: (mode) => set({ mode }),
  hydrateWatchlist: (symbols) => set((state) => {
    const watchlist = dedupeSymbols(symbols);
    return {
      watchlist: watchlist.length > 0 ? watchlist : state.watchlist,
      selectedSymbol: watchlist[0] ?? state.selectedSymbol,
    };
  }),
  addStock: (symbol) => {
    const normalized = normalizeSymbol(symbol);
    if (normalized.length !== 6) return;
    set((state) => ({
      query: "",
      selectedSymbol: normalized,
      watchlist: state.watchlist.includes(normalized)
        ? state.watchlist : [normalized, ...state.watchlist],
    }));
  },
  removeStock: (symbol) => set((state) => {
    const remaining = state.watchlist.filter((item) => item !== symbol);
    const watchlist = remaining.length ? remaining : [DEFAULT_SYMBOL];
    return {
      watchlist,
      selectedSymbol: symbol === state.selectedSymbol ? watchlist[0] : state.selectedSymbol,
    };
  }),
}));
