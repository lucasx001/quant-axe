"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BarChart3, RefreshCw } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { apiRequest } from "@/lib/api-client";

type EngineStatus = {
  status: "unavailable" | "incomplete" | "snapshot_ready";
  reason?: string;
  snapshot_id?: string;
  hikyuu_version?: string;
};

type BacktestResult = {
  status: "exploratory";
  coverage: Array<{ symbol: string; bars: number; first_date: string; last_date: string }>;
  metrics: { total_return: number };
  trades: Array<{ date: string; symbol: string; business: string; quantity: number; price: number; cost: number }>;
  equity_curve: Array<{ date: string; cash: number; market_value: number; total_assets: number }>;
  unverified_constraints: string[];
};

type BacktestRun = {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  snapshot_id: string;
  created_at: string;
  error: string | null;
  result?: BacktestResult | null;
};

const missingChecks: Record<string, string> = {
  historical_st: "历史 ST 状态",
  historical_suspension: "历史停牌",
  daily_price_limits: "逐日涨跌停",
  t_plus_one: "T+1 卖出限制",
  slippage: "滑点",
  point_in_time_universe: "逐日股票池",
  corporate_action_accounting: "分红送配处理",
};

function money(value: number): string {
  return `¥${value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
}

function tradeSide(business: string): string {
  if (business === "BUSINESS.BUY") return "买入";
  if (business === "BUSINESS.SELL") return "卖出";
  return business;
}

export function BacktestCenterPage() {
  const queryClient = useQueryClient();
  const engineQuery = useQuery({
    queryKey: ["backtests", "hikyuu", "status"],
    queryFn: ({ signal }) => apiRequest<EngineStatus>("/api/backtests/hikyuu/status", { signal }),
    refetchInterval: 15_000,
  });
  const runsQuery = useQuery({
    queryKey: ["backtests", "list"],
    queryFn: ({ signal }) => apiRequest<{ data: BacktestRun[] }>("/api/backtests", { signal }),
    refetchInterval: (query) => query.state.data?.data.some((run) =>
      run.status === "queued" || run.status === "running") ? 3_000 : false,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedQuery = useQuery({
    queryKey: ["backtests", selectedId],
    queryFn: ({ signal }) => apiRequest<BacktestRun>(`/api/backtests/${selectedId}`, { signal }),
    enabled: selectedId !== null,
    refetchInterval: (query) => ["queued", "running"].includes(query.state.data?.status ?? "") ? 3_000 : false,
  });
  const [symbols, setSymbols] = useState("600519");
  const [startDate, setStartDate] = useState("2022-01-01");
  const [endDate, setEndDate] = useState("2025-12-31");
  const [cash, setCash] = useState(300000);
  const createMutation = useMutation({
    mutationFn: (payload: { symbols: string[]; start_date: string; end_date: string; initial_cash: number }) =>
      apiRequest<BacktestRun>("/api/backtests", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: (queued) => {
      queryClient.setQueryData(["backtests", queued.id], queued);
      setSelectedId(queued.id);
      void queryClient.invalidateQueries({ queryKey: ["backtests", "list"] });
    },
  });

  function startBacktest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const symbolList = symbols.split(/[\s,，;；]+/).map((item) => item.trim()).filter(Boolean);
    createMutation.mutate({
      symbols: symbolList, start_date: startDate, end_date: endDate, initial_cash: cash,
    });
  }

  const engine = engineQuery.data;
  const runs = runsQuery.data?.data ?? [];
  const selected = selectedQuery.data;
  const submitting = createMutation.isPending;
  const message = createMutation.error?.message ?? engineQuery.error?.message
    ?? runsQuery.error?.message ?? selectedQuery.error?.message ?? "";
  const result = selected?.result;
  const lastEquity = result?.equity_curve.at(-1);

  return (
    <main className="min-h-screen bg-[#080a0d] text-slate-100">
      <header className="border-b border-white/10 bg-[#0b1016]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <Link href="/" aria-label="返回行情看板" className="rounded-md border border-white/10 p-2 text-slate-400 hover:text-white"><ArrowLeft size={18} /></Link>
            <BarChart3 size={22} className="text-emerald-300" />
            <div><h1 className="text-xl font-semibold">历史回测</h1><p className="text-xs text-slate-400">用过去的行情试运行策略</p></div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => {
              void engineQuery.refetch();
              void runsQuery.refetch();
              if (selectedId) void selectedQuery.refetch();
            }} className="rounded-md border border-white/10 p-2 text-slate-400 hover:text-white" aria-label="刷新"><RefreshCw size={17} /></button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        <section className="rounded-lg border border-amber-400/25 bg-amber-400/8 p-4 text-sm text-amber-100">
          <strong>研究预览</strong>：当前只演示固定股票的均线策略。历史 ST、停牌、涨跌停和分红送配尚未逐项核验，结果不能作为交易依据。
        </section>
        <section className="rounded-lg border border-white/10 bg-[#0d131a] p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><span className="text-slate-400">历史数据：</span><strong>{engine?.status === "snapshot_ready" ? "快照已就绪" : engine?.status === "unavailable" ? "Hikyuu 未安装" : "尚未就绪"}</strong></div>
            {engine?.hikyuu_version && <span className="text-slate-500">Hikyuu {engine.hikyuu_version}</span>}
          </div>
          {engine?.snapshot_id && <p className="mt-1 text-xs text-slate-500">数据版本：{engine.snapshot_id}</p>}
          {engine?.reason && <p className="mt-2 text-amber-200">{engine.reason}</p>}
        </section>
        {message && <p role="alert" className="rounded-md border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">{message}</p>}

        <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
          <div className="space-y-5">
            <form onSubmit={(event) => void startBacktest(event)} className="space-y-4 rounded-lg border border-white/10 bg-[#0d131a] p-4">
              <h2 className="text-lg">新建回测</h2>
              <p className="text-xs text-slate-400">策略：5 日指数均线与其 10 日平滑线交叉，下一交易日执行。最多输入 20 只股票。</p>
              <label className="block text-sm text-slate-300">股票代码（逗号分隔）<input required value={symbols} onChange={(event) => setSymbols(event.target.value)} placeholder="600519, 000001" className="mt-1 w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 text-white" /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm text-slate-300">开始日期<input required type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1 w-full rounded-md border border-white/10 bg-black/20 px-2 py-2 text-white" /></label>
                <label className="text-sm text-slate-300">结束日期<input required type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-1 w-full rounded-md border border-white/10 bg-black/20 px-2 py-2 text-white" /></label>
              </div>
              <label className="block text-sm text-slate-300">起始资金（元）<input required type="number" min="1" value={cash} onChange={(event) => setCash(Number(event.target.value))} className="mt-1 w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 text-white" /></label>
              <button disabled={engine?.status !== "snapshot_ready" || submitting} className="w-full rounded-md bg-emerald-400 px-4 py-2 font-medium text-[#08110e] hover:bg-emerald-300 disabled:opacity-50">{submitting ? "正在提交…" : "运行研究回测"}</button>
            </form>
            <section className="rounded-lg border border-white/10 bg-[#0d131a] p-4">
              <h2 className="mb-3 text-lg">最近任务</h2>
              {runs.length === 0 ? <p className="text-sm text-slate-500">暂无记录</p> : <div className="space-y-2">{runs.map((run) => <button key={run.id} type="button" onClick={() => setSelectedId(run.id)} className={`w-full rounded-md border p-3 text-left text-sm ${selectedId === run.id ? "border-emerald-400/40 bg-emerald-400/10" : "border-white/10 hover:bg-white/5"}`}><span className="flex justify-between gap-2"><span>{new Date(run.created_at).toLocaleString("zh-CN")}</span><span>{run.status === "completed" ? "完成" : run.status === "failed" ? "失败" : run.status === "running" ? "运行中" : "排队中"}</span></span><span className="mt-1 block truncate text-xs text-slate-500">{run.id}</span></button>)}</div>}
            </section>
          </div>

          <section className="min-w-0 rounded-lg border border-white/10 bg-[#0d131a] p-4">
            <h2 className="text-lg">回测结果</h2>
            {!selected && <p className="mt-4 text-sm text-slate-500">选择一条任务查看结果。</p>}
            {selected && !result && <div className="mt-4 space-y-2 text-sm"><p>状态：{selected.status}</p><p className="text-slate-500">数据版本：{selected.snapshot_id}</p>{selected.error && <p className="text-rose-200">{selected.error}</p>}</div>}
            {result && <div className="mt-4 space-y-5">
              <div className="grid gap-3 sm:grid-cols-2"><Metric label="总收益率" value={`${(result.metrics.total_return * 100).toFixed(2)}%`} /><Metric label="期末总资产" value={lastEquity ? money(lastEquity.total_assets) : "—"} /></div>
              <div><h3 className="mb-2 font-medium">数据覆盖</h3><div className="space-y-1 text-sm text-slate-400">{result.coverage.map((item) => <p key={item.symbol}>{item.symbol}：{item.first_date} 至 {item.last_date}，{item.bars} 个交易日</p>)}</div></div>
              <div><h3 className="mb-2 font-medium">成交记录（{result.trades.length}）</h3>{result.trades.length === 0 ? <p className="text-sm text-slate-500">本次没有成交。</p> : <div className="max-h-64 overflow-auto text-sm">{result.trades.map((trade, index) => <div key={`${trade.date}-${trade.symbol}-${index}`} className="grid grid-cols-[90px_1fr_auto] gap-2 border-b border-white/5 py-2"><span>{trade.date}</span><span>{trade.symbol} · {tradeSide(trade.business)} · {trade.quantity} 股</span><span>{money(trade.price)}</span></div>)}</div>}</div>
              <div><h3 className="mb-2 font-medium">仍待核验</h3><p className="text-sm text-amber-200">{result.unverified_constraints.map((item) => missingChecks[item] ?? item).join("、")}</p></div>
            </div>}
          </section>
        </div>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-white/10 bg-black/20 p-4"><p className="text-sm text-slate-400">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>;
}
