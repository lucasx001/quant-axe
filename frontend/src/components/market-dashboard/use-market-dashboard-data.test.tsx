import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useMarketDetails, useMarketSnapshot } from "@/components/market-dashboard/use-market-dashboard-data";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function response(data: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 503, json: async () => data } as Response;
}

function queryWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
  return {
    client,
    wrapper: ({ children }: { children: ReactNode }) =>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  };
}

describe("React Query market data", () => {
  it("keeps the last quote and marks it stale after a partial snapshot failure", async () => {
    let requests = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      requests += 1;
      return response(requests === 1
        ? { quotes: { data: [{ symbol: "600519", name: "贵州茅台" }] }, indexes: { data: [] } }
        : { quotes: { data: [], failed: [{ symbol: "600519", error: "timeout" }] }, indexes: { data: [] } });
    }));
    const { client, wrapper } = queryWrapper();
    const { result } = renderHook(() => useMarketSnapshot(["600519"]), { wrapper });
    await waitFor(() => expect(result.current.quoteCache["600519"]?.status).toBe("ready"));

    await client.invalidateQueries({ queryKey: ["market", "snapshot", "600519"] });
    await waitFor(() => expect(result.current.quoteCache["600519"]?.status).toBe("stale"));
    expect(result.current.quoteCache["600519"].quote?.name).toBe("贵州茅台");
    client.clear();
  });

  it("loads independent details in parallel and isolates one failed source", async () => {
    const requested = new Set<string>();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      requested.add(url);
      if (url.includes("/order-book/")) return response({ error: "unavailable" }, false);
      return response({ data: [], source: "test" });
    }));
    const { client, wrapper } = queryWrapper();
    const { result } = renderHook(() => useMarketDetails("600519"), { wrapper });
    await waitFor(() => expect(requested.size).toBe(6));
    await waitFor(() => expect(result.current.orderBook.status).toBe("error"));
    expect(result.current.trades.status).toBe("empty");
    expect(result.current.news.status).toBe("empty");
    client.clear();
  });
});
