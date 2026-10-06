"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BrainCircuit,
  ExternalLink,
  Flame,
  Gauge,
  Newspaper,
  Radio,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import {
  useHotNews,
  useNewsAnalysis,
} from "@/components/market-dashboard/use-market-dashboard-data";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/market-format";
import type { NewsAnalysis, NewsItem } from "@/lib/market-types";
import { formatNewsTime, newsTimestamp, sortNewsByTimeDesc } from "@/lib/news-utils";

type SourceOption = {
  id: string;
  name: string;
  count: number;
};

const SOURCE_ORDER = ["cls-hot", "wallstreetcn-hot", "ifeng"];

export function NewsPage() {
  const queryClient = useQueryClient();
  const hotNews = useHotNews(200);
  const analysis = useNewsAnalysis();
  const [activeSource, setActiveSource] = useState("all");

  const sortedNews = useMemo(() => sortNewsByTimeDesc(hotNews.data), [hotNews.data]);
  const sources = useMemo(() => sourceOptions(sortedNews), [sortedNews]);
  const sourceGroups = useMemo(
    () =>
      sources
        .filter((source) => activeSource === "all" || source.id === activeSource)
        .map((source) => ({
          ...source,
          items: sortedNews
            .filter((item) => sourceId(item) === source.id)
            .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity)),
        })),
    [activeSource, sortedNews, sources],
  );
  const visibleCount = sourceGroups.reduce((count, source) => count + source.items.length, 0);
  const lastUpdated = useMemo(() => latestTimeLabel(sortedNews), [sortedNews]);

  return (
    <main className="min-h-screen bg-[#080a0d] text-slate-100">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0c1117]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              className="grid size-9 place-items-center rounded-md border border-white/10 text-slate-400 transition hover:border-emerald-300/50 hover:text-emerald-200"
              aria-label="返回 Dashboard"
            >
              <ArrowLeft size={18} />
            </Link>
            <div className="grid size-10 place-items-center rounded-md border border-emerald-400/40 bg-emerald-400/10 text-emerald-300">
              <Newspaper size={21} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold">QuantDash News</h1>
              <p className="truncate text-xs text-slate-500">财经热榜与 A 股舆情分析</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden rounded-md border border-white/10 px-3 py-2 text-xs text-slate-500 sm:inline">
              {lastUpdated ? `快照 ${lastUpdated}` : "等待数据"}
            </span>
            <ThemeToggle />
            <button
              type="button"
              onClick={() => {
                void queryClient.invalidateQueries({ queryKey: ["news", "hot", 200] });
                void queryClient.invalidateQueries({ queryKey: ["news", "analysis", "latest"] });
              }}
              className="grid size-9 place-items-center rounded-md border border-white/10 text-slate-400 transition hover:border-emerald-300/50 hover:text-emerald-200"
              aria-label="刷新新闻"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 lg:grid-cols-[220px_minmax(0,1fr)] lg:px-6">
        <aside className="lg:sticky lg:top-[76px] lg:self-start">
          <section className="rounded-lg border border-white/10 bg-[#0d131a]">
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
              <Flame size={17} className="text-emerald-300" />
              <h2 className="font-medium">财经来源</h2>
            </div>
            <div className="space-y-1 p-2">
              <SourceButton
                label="全部热榜"
                count={sortedNews.length}
                active={activeSource === "all"}
                onClick={() => setActiveSource("all")}
              />
              {sources.map((source) => (
                <SourceButton
                  key={source.id}
                  label={source.name}
                  count={source.count}
                  active={activeSource === source.id}
                  onClick={() => setActiveSource(source.id)}
                />
              ))}
            </div>
          </section>
        </aside>

        <div className="min-w-0 space-y-5">
          {hotNews.stale && (
            <div className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
              R2 当日快照暂不可用，当前展示最近可读快照：{hotNews.snapshot_date ?? "未知日期"}{" "}
              {hotNews.snapshot_crawl_time ?? ""}
            </div>
          )}
          <AIAnalysisPanel analysis={analysis.data} status={analysis.status} stale={analysis.stale} />
          <section className="rounded-lg border border-white/10 bg-[#0d131a]">
            <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-4 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm text-emerald-300">
                  <Radio size={16} />
                  <span>R2 Market Pulse</span>
                </div>
                <h2 className="mt-1 text-2xl font-semibold">财经热点热榜</h2>
              </div>
              <div className="text-sm text-slate-500">
                {hotNews.status === "loading" && sortedNews.length === 0 ? "正在读取 R2 快照" : `${visibleCount} 条新闻`}
              </div>
            </div>

            {sourceGroups.length > 0 ? (
              <div className="divide-y divide-white/10">
                {sourceGroups.map((source) => (
                  <section key={source.id}>
                    <div className="flex items-center justify-between bg-black/10 px-4 py-3">
                      <h3 className="font-medium text-slate-200">{source.name}</h3>
                      <span className="font-mono text-xs text-slate-500">{source.items.length} 条</span>
                    </div>
                    <ol className="divide-y divide-white/10">
                      {source.items.map((item, index) => (
                        <NewsRow key={`${source.id}-${item.rank ?? index}-${item.title}`} item={item} index={index} />
                      ))}
                    </ol>
                  </section>
                ))}
              </div>
            ) : (
              <div className="p-5">
                <div className="rounded-md border border-white/10 bg-black/20 p-4 text-sm">
                  <div className="font-medium text-slate-300">
                    {hotNews.status === "error" ? "热点新闻暂不可用" : "正在加载热点新闻"}
                  </div>
                  <p className="mt-2 text-slate-500">
                    {hotNews.message ?? "正在读取 news-collector 上传到 R2 的财经热榜快照。"}
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function AIAnalysisPanel({
  analysis,
  status,
  stale,
}: {
  analysis: NewsAnalysis | null;
  status: "loading" | "ready" | "waiting" | "error";
  stale?: boolean;
}) {
  if (!analysis) {
    return (
      <section className="rounded-lg border border-white/10 bg-[#0d131a] p-4">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-md bg-emerald-300/10 text-emerald-300">
            <BrainCircuit size={20} />
          </div>
          <div>
            <h2 className="text-lg font-semibold">A 股热点研判</h2>
            <p className="mt-1 text-sm text-slate-500">
              {status === "error"
                ? "AI 分析暂不可用，财经热榜仍可正常浏览。"
                : "等待下一个 A 股时间线节点生成分析，财经热榜会先行展示。"}
            </p>
          </div>
        </div>
      </section>
    );
  }

  const cards = [
    { title: "核心趋势", content: analysis.core_trends, icon: TrendingUp },
    { title: "舆论争议", content: analysis.sentiment_controversy, icon: ShieldAlert },
    { title: "异动信号", content: analysis.signals, icon: Gauge },
    { title: "量化观察", content: analysis.outlook_strategy, icon: Sparkles },
  ];

  return (
    <section className="rounded-lg border border-emerald-400/25 bg-[#0d131a]">
      <div className="flex flex-col gap-2 border-b border-white/10 px-4 py-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-emerald-300">
            <BrainCircuit size={16} />
            <span>A-share Intelligence</span>
          </div>
          <h2 className="mt-1 text-2xl font-semibold">A 股热点研判</h2>
        </div>
        <div className="font-mono text-xs text-slate-500">
          {analysis.node_key} · {analysis.analysis_mode} · {formatAnalysisTime(analysis.generated_at)}
          {stale ? " · 历史快照" : ""}
        </div>
      </div>
      <div className="grid gap-px bg-white/10 md:grid-cols-2">
        {cards.map(({ title, content, icon: Icon }) => (
          <article key={title} className="bg-[#0d131a] p-4">
            <div className="flex items-center gap-2 text-sm text-emerald-300">
              <Icon size={15} />
              <h3>{title}</h3>
            </div>
            <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-400">{content || "暂无显著异常"}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function SourceButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition",
        active ? "bg-emerald-300 text-black" : "text-slate-400 hover:bg-white/5 hover:text-slate-100",
      )}
    >
      <span className="truncate">{label}</span>
      <span className={cn("ml-3 font-mono text-xs", active ? "text-black/70" : "text-slate-600")}>{count}</span>
    </button>
  );
}

function NewsRow({ item, index }: { item: NewsItem; index: number }) {
  const source = item.source_name ?? item.source ?? sourceId(item);
  const href = item.url || item.mobile_url;

  return (
    <li className="grid gap-3 px-4 py-4 transition hover:bg-white/3 md:grid-cols-[3rem_minmax(0,1fr)_150px] md:items-start">
      <div className="font-mono text-xl text-slate-600">{String(index + 1).padStart(2, "0")}</div>
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="rounded border border-white/10 px-2 py-1 text-xs text-slate-500">{source}</span>
          {typeof item.rank === "number" && (
            <span className="rounded bg-emerald-300/10 px-2 py-1 font-mono text-xs text-emerald-300">
              #{item.rank}
            </span>
          )}
          {typeof item.crawl_count === "number" && item.crawl_count > 1 && (
            <span className="font-mono text-xs text-slate-600">持续 {item.crawl_count} 次</span>
          )}
        </div>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="group inline-flex max-w-full items-start gap-2 text-base font-medium text-slate-100 transition hover:text-emerald-300"
          >
            <span className="min-w-0">{item.title}</span>
            <ExternalLink size={15} className="mt-1 shrink-0 opacity-0 transition group-hover:opacity-100" />
          </a>
        ) : (
          <h3 className="text-base font-medium text-slate-100">{item.title}</h3>
        )}
      </div>
      <time className="whitespace-nowrap font-mono text-sm text-slate-500 md:text-right">{formatNewsTime(item)}</time>
    </li>
  );
}

function sourceOptions(items: NewsItem[]) {
  const bySource = new Map<string, SourceOption>();
  for (const item of items) {
    const id = sourceId(item);
    const current = bySource.get(id);
    bySource.set(id, {
      id,
      name: item.source_name ?? item.source ?? id,
      count: (current?.count ?? 0) + 1,
    });
  }
  return Array.from(bySource.values()).sort(
    (a, b) => SOURCE_ORDER.indexOf(a.id) - SOURCE_ORDER.indexOf(b.id),
  );
}

function sourceId(item: NewsItem) {
  return item.source_id ?? item.source ?? "unknown";
}

function latestTimeLabel(items: NewsItem[]) {
  const timestamp = Math.max(...items.map(newsTimestamp));
  if (!Number.isFinite(timestamp)) {
    return "";
  }
  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatAnalysisTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
