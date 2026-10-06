"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api-client";
import {
  ArrowLeft,
  Check,
  Database,
  Filter,
  Layers3,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/market-format";
import type {
  Universe,
  UniverseBase,
  UniverseFilter,
  UniverseFilterType,
  UniverseListPayload,
  UniverseMember,
  UniverseMembersPayload,
} from "@/lib/universe-types";

type RequestState = "idle" | "loading" | "ready" | "error";

const BASE_OPTIONS: Array<{ value: UniverseBase; label: string; hint: string }> = [
  { value: "hs300", label: "沪深300", hint: "大盘核心" },
  { value: "zz500", label: "中证500", hint: "中盘样本" },
  { value: "zz1000", label: "中证1000", hint: "小盘样本" },
  { value: "all_a", label: "全A", hint: "沪深北" },
  { value: "custom", label: "自定义", hint: "待扩展" },
];

const FILTER_OPTIONS: Array<{
  type: UniverseFilterType;
  label: string;
  tone: string;
}> = [
  { type: "st", label: "剔除 ST", tone: "text-rose-200" },
  { type: "suspension", label: "剔除停牌", tone: "text-amber-200" },
  { type: "listed_days", label: "上市天数", tone: "text-sky-200" },
  { type: "liquidity", label: "成交额", tone: "text-emerald-200" },
  { type: "price", label: "价格区间", tone: "text-cyan-200" },
  { type: "limit_up_down", label: "涨跌停标记", tone: "text-violet-200" },
];

const DEFAULT_FILTERS: UniverseFilter[] = [
  { type: "st" },
  { type: "suspension" },
  { type: "limit_up_down" },
];
const DEFAULT_UNIVERSE_ID = "builtin-hs300-basic";
const EMPTY_UNIVERSES: Universe[] = [];

export function UniverseCenterPage() {
  const queryClient = useQueryClient();
  const listQuery = useQuery({
    queryKey: ["universes"],
    queryFn: ({ signal }) => apiRequest<UniverseListPayload>("/api/universes", { signal }),
  });
  const universes = listQuery.data?.data ?? EMPTY_UNIVERSES;
  const [selectedId, setSelectedId] = useState(DEFAULT_UNIVERSE_ID);
  const [draftOverride, setDraftOverride] = useState<UniverseDraft | null>(null);
  const [targetDate, setTargetDate] = useState(todayInputValue());
  const [membersPayload, setMembersPayload] = useState<UniverseMembersPayload | null>(null);
  const [message, setMessage] = useState("");
  const [showExcludedOnly, setShowExcludedOnly] = useState(false);

  const selectedUniverse = useMemo(
    () => universes.find((universe) => universe.id === selectedId) ?? null,
    [selectedId, universes],
  );
  const draft = draftOverride ?? (selectedUniverse ? universeToDraft(selectedUniverse) : emptyDraft());
  const selectedIsBuiltin = selectedId.startsWith("builtin-");
  const dirty = selectedUniverse ? !sameDraft(selectedUniverse, draft) : true;
  const listState: RequestState = listQuery.isError ? "error" : listQuery.isPending || listQuery.isFetching
    ? "loading" : "ready";

  const previewMutation = useMutation({
    mutationFn: ({ id, nextDraft, date }: { id: string; nextDraft: UniverseDraft; date: string }) =>
      apiRequest<UniverseMembersPayload>(`/api/universes/${id}/preview`, {
        method: "POST", body: JSON.stringify(draftToPayload(nextDraft, date)),
      }),
    onSuccess: (payload) => { setMembersPayload(payload); setMessage(""); },
    onError: (error) => setMessage(errorMessage(error, "预览失败")),
  });
  const saveMutation = useMutation({
    mutationFn: ({ id, nextDraft, create }: { id: string; nextDraft: UniverseDraft; create: boolean }) =>
      apiRequest<Universe>(create ? "/api/universes" : `/api/universes/${id}`, {
        method: create ? "POST" : "PATCH",
        body: JSON.stringify(draftToPayload(nextDraft)),
      }),
    onSuccess: (saved, variables) => {
      setSelectedId(saved.id);
      setDraftOverride(universeToDraft(saved));
      setMembersPayload(null);
      setMessage(variables.create ? "已创建股票池" : "已保存股票池");
      void queryClient.invalidateQueries({ queryKey: ["universes"] });
    },
    onError: (error) => setMessage(errorMessage(error, "保存失败")),
  });
  const snapshotMutation = useMutation({
    mutationFn: ({ id, date }: { id: string; date: string }) =>
      apiRequest<UniverseMembersPayload>(`/api/universes/${id}/snapshot`, {
        method: "POST", body: JSON.stringify({ date }),
      }),
    onSuccess: (payload) => {
      setMembersPayload(payload);
      setMessage(`已保存 ${payload.saved ?? payload.total} 条快照`);
    },
    onError: (error) => setMessage(errorMessage(error, "快照保存失败")),
  });
  const previewState: RequestState = previewMutation.isPending ? "loading"
    : previewMutation.isError ? "error" : previewMutation.isSuccess ? "ready" : "idle";
  const saveState: RequestState = saveMutation.isPending || snapshotMutation.isPending ? "loading"
    : saveMutation.isError || snapshotMutation.isError ? "error"
      : saveMutation.isSuccess || snapshotMutation.isSuccess ? "ready" : "idle";

  const visibleMembers = useMemo(() => {
    const rows = membersPayload?.data ?? [];
    return showExcludedOnly ? rows.filter((row) => !row.included) : rows;
  }, [membersPayload, showExcludedOnly]);

  function createUniverseFromDraft() {
    const freshDraft = {
      ...draft,
      name: draft.name.trim() ? `${draft.name.trim()} 副本` : "新股票池",
    };
    setMessage("");
    saveMutation.mutate({ id: "", nextDraft: freshDraft, create: true });
  }

  function snapshotUniverse() {
    if (!selectedId || dirty) return;
    setMessage("");
    snapshotMutation.mutate({ id: selectedId, date: targetDate });
  }

  return (
    <main className="min-h-screen bg-[#080a0d] text-slate-100">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0b1016]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3 px-4 py-3 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              className="grid size-9 place-items-center rounded-md border border-white/10 text-slate-400 transition hover:border-emerald-300/50 hover:text-emerald-200"
              aria-label="返回 Dashboard"
            >
              <ArrowLeft size={18} />
            </Link>
            <div className="grid size-10 place-items-center rounded-md border border-emerald-400/40 bg-emerald-400/10 text-emerald-300">
              <Layers3 size={21} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold">Universe Center</h1>
              <p className="truncate font-mono text-xs text-slate-500">Point-in-time universe builder</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StatusPill state={listState} label={universes.length ? `${universes.length} pools` : "loading"} />
            <ThemeToggle />
            <IconButton label="刷新股票池" onClick={() => void listQuery.refetch()} icon={<RefreshCw size={16} />} />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-4 px-4 py-4 lg:grid-cols-[280px_minmax(360px,430px)_minmax(0,1fr)] lg:px-6">
        <UniverseList
          universes={universes}
          selectedId={selectedId}
          state={listState}
          onSelectUniverse={(universe) => {
            setSelectedId(universe.id);
            setDraftOverride(universeToDraft(universe));
            setMembersPayload(null);
            previewMutation.reset();
            setMessage("");
          }}
          onCreate={() => {
            setSelectedId("");
            setDraftOverride(emptyDraft());
            setMembersPayload(null);
            previewMutation.reset();
          }}
        />

        <ConfigPanel
          draft={draft}
          selectedIsBuiltin={selectedIsBuiltin}
          dirty={dirty}
          saveState={saveState}
          previewState={previewState}
          targetDate={targetDate}
          onDraftChange={setDraftOverride}
          onTargetDateChange={setTargetDate}
          onPreview={() => {
            if (selectedId) previewMutation.mutate({ id: selectedId, nextDraft: draft, date: targetDate });
          }}
          onSave={() => saveMutation.mutate({
            id: selectedId, nextDraft: draft, create: selectedIsBuiltin || !selectedId,
          })}
          onCreateCopy={createUniverseFromDraft}
          onSnapshot={snapshotUniverse}
        />

        <PreviewPanel
          payload={membersPayload}
          rows={visibleMembers}
          state={previewState}
          message={message || listQuery.error?.message || ""}
          showExcludedOnly={showExcludedOnly}
          onShowExcludedOnly={setShowExcludedOnly}
        />
      </div>
    </main>
  );
}

type UniverseDraft = {
  name: string;
  base: UniverseBase;
  filters: UniverseFilter[];
};

function UniverseList({
  universes,
  selectedId,
  state,
  onSelectUniverse,
  onCreate,
}: {
  universes: Universe[];
  selectedId: string;
  state: RequestState;
  onSelectUniverse: (universe: Universe) => void;
  onCreate: () => void;
}) {
  return (
    <aside className="rounded-lg border border-white/10 bg-[#0d131a] lg:sticky lg:top-[76px] lg:self-start">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <Database size={17} className="text-emerald-300" />
          <h2 className="font-medium">股票池</h2>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="rounded-md border border-emerald-300/30 px-3 py-1.5 text-xs text-emerald-200 transition hover:border-emerald-300/60 hover:bg-emerald-300/10"
        >
          新建
        </button>
      </div>

      <div className="max-h-[calc(100vh-150px)] space-y-2 overflow-auto p-2">
        {universes.map((universe) => (
          <button
            type="button"
            key={universe.id}
            onClick={() => onSelectUniverse(universe)}
            className={cn(
              "w-full rounded-md border px-3 py-3 text-left transition",
              selectedId === universe.id
                ? "border-emerald-300/50 bg-emerald-300/10"
                : "border-transparent hover:border-white/10 hover:bg-white/5",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-medium text-slate-100">{universe.name}</div>
                <div className="mt-1 font-mono text-xs text-slate-500">{baseLabel(universe.base)}</div>
              </div>
              {universe.id.startsWith("builtin-") && (
                <span className="shrink-0 rounded border border-emerald-300/30 px-1.5 py-0.5 text-[11px] text-emerald-300">
                  内置
                </span>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
              <span>{universe.filters.length} filters</span>
              <span className="truncate">{formatUpdatedAt(universe.updated_at)}</span>
            </div>
          </button>
        ))}

        {universes.length === 0 && (
          <div className="rounded-md border border-white/10 bg-black/20 p-4 text-sm text-slate-500">
            {state === "loading" ? "加载中" : "暂无股票池"}
          </div>
        )}
      </div>
    </aside>
  );
}

function ConfigPanel({
  draft,
  selectedIsBuiltin,
  dirty,
  saveState,
  previewState,
  targetDate,
  onDraftChange,
  onTargetDateChange,
  onPreview,
  onSave,
  onCreateCopy,
  onSnapshot,
}: {
  draft: UniverseDraft;
  selectedIsBuiltin: boolean;
  dirty: boolean;
  saveState: RequestState;
  previewState: RequestState;
  targetDate: string;
  onDraftChange: (draft: UniverseDraft) => void;
  onTargetDateChange: (date: string) => void;
  onPreview: () => void;
  onSave: () => void;
  onCreateCopy: () => void;
  onSnapshot: () => void;
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-[#0d131a]">
      <div className="border-b border-white/10 px-4 py-4">
        <div className="flex items-center gap-2 text-sm text-emerald-300">
          <SlidersHorizontal size={16} />
          <span>Config</span>
        </div>
        <h2 className="mt-1 text-xl font-semibold">配置</h2>
      </div>

      <div className="space-y-5 p-4">
        <label className="block">
          <span className="mb-2 block text-sm text-slate-400">名称</span>
          <input
            value={draft.name}
            onChange={(event) => onDraftChange({ ...draft, name: event.target.value })}
            className="h-10 w-full rounded-md border border-white/10 bg-black/20 px-3 text-sm outline-none transition placeholder:text-slate-700 focus:border-emerald-300/60"
            placeholder="股票池名称"
          />
        </label>

        <div>
          <div className="mb-2 text-sm text-slate-400">基础池</div>
          <div className="grid grid-cols-2 gap-2">
            {BASE_OPTIONS.map((option) => (
              <button
                type="button"
                key={option.value}
                onClick={() => onDraftChange({ ...draft, base: option.value })}
                className={cn(
                  "rounded-md border px-3 py-2 text-left transition",
                  draft.base === option.value
                    ? "border-emerald-300/50 bg-emerald-300/10"
                    : "border-white/10 bg-black/10 hover:border-white/20",
                )}
              >
                <div className="text-sm font-medium">{option.label}</div>
                <div className="mt-1 text-xs text-slate-500">{option.hint}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2 text-sm text-slate-400">
            <Filter size={15} />
            <span>过滤器</span>
          </div>
          <div className="space-y-2">
            {FILTER_OPTIONS.map((option) => (
              <FilterControl
                key={option.type}
                option={option}
                filter={draft.filters.find((item) => item.type === option.type)}
                onToggle={(enabled) =>
                  onDraftChange({
                    ...draft,
                    filters: enabled
                      ? addFilter(draft.filters, defaultFilter(option.type))
                      : draft.filters.filter((item) => item.type !== option.type),
                  })
                }
                onChange={(filter) =>
                  onDraftChange({
                    ...draft,
                    filters: draft.filters.map((item) => (item.type === filter.type ? filter : item)),
                  })
                }
              />
            ))}
          </div>
        </div>

        <label className="block">
          <span className="mb-2 block text-sm text-slate-400">交易日</span>
          <input
            type="date"
            value={targetDate}
            onChange={(event) => onTargetDateChange(event.target.value)}
            className="h-10 w-full rounded-md border border-white/10 bg-black/20 px-3 font-mono text-sm outline-none transition focus:border-emerald-300/60"
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <CommandButton
            label={previewState === "loading" ? "预览中" : "预览"}
            icon={<Search size={16} />}
            onClick={onPreview}
            strong
            disabled={previewState === "loading"}
          />
          <CommandButton
            label={selectedIsBuiltin ? "另存" : saveState === "loading" ? "保存中" : "保存"}
            icon={<Save size={16} />}
            onClick={onSave}
          />
          <CommandButton label="创建副本" icon={<Layers3 size={16} />} onClick={onCreateCopy} />
          <CommandButton
            label="生成快照"
            icon={<ShieldCheck size={16} />}
            onClick={onSnapshot}
            disabled={dirty}
          />
        </div>
      </div>
    </section>
  );
}

function FilterControl({
  option,
  filter,
  onToggle,
  onChange,
}: {
  option: { type: UniverseFilterType; label: string; tone: string };
  filter?: UniverseFilter;
  onToggle: (enabled: boolean) => void;
  onChange: (filter: UniverseFilter) => void;
}) {
  const enabled = Boolean(filter);

  return (
    <div className={cn("rounded-md border p-3", enabled ? "border-white/15 bg-white/5" : "border-white/10 bg-black/10")}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className={cn("truncate text-sm font-medium", enabled ? option.tone : "text-slate-500")}>
            {option.label}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onToggle(!enabled)}
          className={cn(
            "relative h-6 w-11 rounded-full border transition",
            enabled ? "border-emerald-300/40 bg-emerald-300/30" : "border-white/10 bg-slate-800",
          )}
          aria-label={`${option.label}${enabled ? "关闭" : "开启"}`}
        >
          <span
            className={cn(
              "absolute top-0.5 grid size-5 place-items-center rounded-full transition",
              enabled ? "left-5 bg-emerald-200 text-black" : "left-0.5 bg-slate-500 text-slate-900",
            )}
          >
            {enabled ? <Check size={12} /> : <X size={12} />}
          </span>
        </button>
      </div>

      {enabled && filter?.type === "listed_days" && (
        <NumberInput
          label="最少天数"
          value={filter.min_days ?? 60}
          min={0}
          onChange={(value) => onChange({ ...filter, min_days: value })}
        />
      )}
      {enabled && filter?.type === "liquidity" && (
        <NumberInput
          label="最低成交额"
          value={filter.min_turnover ?? 100000000}
          min={0}
          step={10000000}
          onChange={(value) => onChange({ ...filter, min_turnover: value })}
        />
      )}
      {enabled && filter?.type === "price" && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <NumberInput
            label="最低价"
            value={filter.min_price ?? 3}
            min={0}
            step={0.5}
            onChange={(value) => onChange({ ...filter, min_price: value })}
          />
          <NumberInput
            label="最高价"
            value={filter.max_price ?? 200}
            min={0}
            step={1}
            onChange={(value) => onChange({ ...filter, max_price: value })}
          />
        </div>
      )}
    </div>
  );
}

function NumberInput({
  label,
  value,
  min,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="mt-3 block">
      <span className="mb-1 block text-xs text-slate-500">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-9 w-full rounded-md border border-white/10 bg-black/20 px-3 font-mono text-sm outline-none transition focus:border-emerald-300/60"
      />
    </label>
  );
}

function PreviewPanel({
  payload,
  rows,
  state,
  message,
  showExcludedOnly,
  onShowExcludedOnly,
}: {
  payload: UniverseMembersPayload | null;
  rows: UniverseMember[];
  state: RequestState;
  message: string;
  showExcludedOnly: boolean;
  onShowExcludedOnly: (value: boolean) => void;
}) {
  return (
    <section className="min-w-0 rounded-lg border border-white/10 bg-[#0d131a]">
      <div className="border-b border-white/10 px-4 py-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-emerald-300">
              <Search size={16} />
              <span>Preview</span>
            </div>
            <h2 className="mt-1 text-xl font-semibold">成分预览</h2>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <input
              type="checkbox"
              checked={showExcludedOnly}
              onChange={(event) => onShowExcludedOnly(event.target.checked)}
              className="size-4 accent-emerald-300"
            />
            只看剔除
          </label>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <MetricBox label="总数" value={payload?.total ?? "--"} />
          <MetricBox label="纳入" value={payload?.included ?? "--"} tone="text-emerald-300" />
          <MetricBox label="剔除" value={payload?.excluded ?? "--"} tone="text-amber-300" />
        </div>
      </div>

      {message && (
        <div className="border-b border-white/10 px-4 py-3 text-sm text-slate-400">
          {message}
        </div>
      )}

      {rows.length > 0 ? (
        <div className="overflow-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead className="sticky top-0 bg-[#101820] text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">代码</th>
                <th className="px-4 py-3 font-medium">名称</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">剔除原因</th>
                <th className="px-4 py-3 font-medium">交易</th>
                <th className="px-4 py-3 font-medium">标记</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {rows.slice(0, 500).map((row) => (
                <tr key={row.symbol} className="transition hover:bg-white/3">
                  <td className="px-4 py-3 font-mono text-slate-300">{row.symbol}</td>
                  <td className="px-4 py-3 text-slate-200">{row.name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "rounded border px-2 py-1 text-xs",
                        row.included
                          ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-200"
                          : "border-amber-300/30 bg-amber-300/10 text-amber-200",
                      )}
                    >
                      {row.included ? "纳入" : "剔除"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{row.excluded_reason ?? "--"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">
                    B {row.can_buy ? "Y" : "N"} / S {row.can_sell ? "Y" : "N"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {row.flags.length > 0 ? (
                        row.flags.map((flag) => (
                          <span key={flag} className="rounded bg-white/5 px-2 py-1 font-mono text-xs text-slate-400">
                            {flag}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-600">--</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 500 && (
            <div className="border-t border-white/10 px-4 py-3 text-sm text-slate-500">
              当前仅渲染前 500 条
            </div>
          )}
        </div>
      ) : (
        <div className="grid min-h-[420px] place-items-center p-5 text-center">
          <div className="max-w-sm rounded-md border border-white/10 bg-black/20 px-5 py-4">
            <div className="mx-auto mb-3 grid size-10 place-items-center rounded-md border border-white/10 text-slate-500">
              <Search size={18} />
            </div>
            <div className="font-medium text-slate-300">
              {state === "loading" ? "正在生成预览" : "等待预览"}
            </div>
            <p className="mt-2 text-sm text-slate-500">选择交易日后生成股票池成分。</p>
          </div>
        </div>
      )}
    </section>
  );
}

function MetricBox({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={cn("mt-1 font-mono text-xl", tone ?? "text-slate-200")}>
        {typeof value === "number" ? value.toLocaleString("zh-CN") : value}
      </div>
    </div>
  );
}

function CommandButton({
  label,
  icon,
  onClick,
  strong,
  disabled,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  strong?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-md border px-3 text-sm transition disabled:cursor-not-allowed disabled:opacity-40",
        strong
          ? "border-emerald-300/40 bg-emerald-300 text-black hover:bg-emerald-200"
          : "border-white/10 bg-white/5 text-slate-200 hover:border-emerald-300/40 hover:text-emerald-200",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function IconButton({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-9 place-items-center rounded-md border border-white/10 text-slate-400 transition hover:border-emerald-300/50 hover:text-emerald-200"
    >
      {icon}
    </button>
  );
}

function StatusPill({ state, label }: { state: RequestState; label: string }) {
  return (
    <span
      className={cn(
        "hidden rounded-md border px-3 py-2 font-mono text-xs sm:inline",
        state === "error"
          ? "border-rose-300/30 text-rose-200"
          : state === "loading"
            ? "border-amber-300/30 text-amber-200"
            : "border-white/10 text-slate-500",
      )}
    >
      {label}
    </span>
  );
}

function emptyDraft(): UniverseDraft {
  return {
    name: "沪深300增强股票池",
    base: "hs300",
    filters: DEFAULT_FILTERS,
  };
}

function universeToDraft(universe: Universe): UniverseDraft {
  return {
    name: universe.name,
    base: universe.base,
    filters: universe.filters,
  };
}

function draftToPayload(draft: UniverseDraft, date?: string) {
  return {
    name: draft.name.trim() || "未命名股票池",
    base: draft.base,
    filters: draft.filters,
    ...(date ? { date } : {}),
  };
}

function sameDraft(universe: Universe, draft: UniverseDraft) {
  return JSON.stringify(universeToDraft(universe)) === JSON.stringify(draft);
}

function addFilter(filters: UniverseFilter[], filter: UniverseFilter) {
  return [...filters.filter((item) => item.type !== filter.type), filter];
}

function defaultFilter(type: UniverseFilterType): UniverseFilter {
  if (type === "listed_days") {
    return { type, min_days: 60 };
  }
  if (type === "liquidity") {
    return { type, min_turnover: 100000000 };
  }
  if (type === "price") {
    return { type, min_price: 3, max_price: 200 };
  }
  return { type };
}

function baseLabel(base: UniverseBase) {
  return BASE_OPTIONS.find((option) => option.value === base)?.label ?? base;
}

function formatUpdatedAt(value: string) {
  if (value === "system") {
    return "system";
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }
  return new Date(timestamp).toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  });
}

function todayInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
