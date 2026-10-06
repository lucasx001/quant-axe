"use client";

import { useEffect, useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import type { ChartMode, KlinePoint } from "@/lib/market-types";

type KlineChartProps = {
  data: KlinePoint[];
  mode: ChartMode;
  previousClose?: number | null;
};

type ChartTheme = ReturnType<typeof readChartTheme>;
type TooltipParam = {
  axisValue?: string;
  axisValueLabel?: string;
  seriesName?: string;
  seriesType?: string;
  value?: number | number[];
};

function movingAverage(dayCount: number, data: KlinePoint[]) {
  return data.map((_, index) => {
    const start = Math.max(0, index - dayCount + 1);
    const window = data.slice(start, index + 1);
    const sum = window.reduce((total, point) => total + point.close, 0);

    return Number((sum / window.length).toFixed(2));
  });
}

function readChartTheme() {
  if (typeof window === "undefined") {
    return {
      foreground: "#141413",
      muted: "#87867f",
      border: "#dedcd1",
      surface: "#ffffff",
      accent: "#c96442",
      down: "#2f7f68",
    };
  }

  const styles = window.getComputedStyle(document.documentElement);
  return {
    foreground: styles.getPropertyValue("--foreground").trim() || "#141413",
    muted: styles.getPropertyValue("--muted").trim() || "#87867f",
    border: styles.getPropertyValue("--border").trim() || "#dedcd1",
    surface: styles.getPropertyValue("--surface").trim() || "#ffffff",
    accent: styles.getPropertyValue("--accent").trim() || "#c96442",
    down: styles.getPropertyValue("--chart-down").trim() || "#2f7f68",
  };

}

function intradayAxisLabel(value: string, mode: ChartMode) {
  if (mode === "5day") {
    return value.slice(5, 10);
  }
  return value.slice(11, 16);
}

function tooltipValue(value: number | undefined) {
  return typeof value === "number" ? value.toLocaleString("zh-CN", { maximumFractionDigits: 2 }) : "--";
}

function tooltipDate(param: TooltipParam | undefined) {
  return param?.axisValueLabel ?? param?.axisValue ?? "";
}

function intradayTooltip(params: TooltipParam[]) {
  const price = params.find((param) => param.seriesName === "分时价");
  const volume = params.find((param) => param.seriesName === "成交量");

  return [
    `<strong>${tooltipDate(price)}</strong>`,
    `价格：${tooltipValue(typeof price?.value === "number" ? price.value : undefined)}`,
    `成交量：${tooltipValue(typeof volume?.value === "number" ? volume.value : undefined)}`,
  ].join("<br />");
}

function candlestickTooltip(params: TooltipParam[]) {
  const candle = params.find((param) => param.seriesType === "candlestick");
  const values = Array.isArray(candle?.value) ? candle.value : [];
  const [open, close, low, high] = values.slice(-4);
  const lines = [
    `<strong>${tooltipDate(candle ?? params[0])}</strong>`,
    `开盘：${tooltipValue(open)}`,
    `收盘：${tooltipValue(close)}`,
    `最低：${tooltipValue(low)}`,
    `最高：${tooltipValue(high)}`,
  ];

  for (const param of params) {
    if (param.seriesType === "candlestick") {
      continue;
    }
    lines.push(`${param.seriesName ?? ""}：${tooltipValue(typeof param.value === "number" ? param.value : undefined)}`);
  }
  return lines.join("<br />");
}

function intradayOption(
  data: KlinePoint[],
  mode: ChartMode,
  previousClose: number | null | undefined,
  theme: ChartTheme,
) {
  const referencePrice = previousClose ?? data[0]?.open ?? 0;
  const maxDelta = data.reduce(
    (largest, point) => Math.max(largest, Math.abs(point.close - referencePrice)),
    0,
  );
  const range = Math.max(maxDelta * 1.12, referencePrice * 0.003);
  const minPrice = Number((referencePrice - range).toFixed(2));
  const maxPrice = Number((referencePrice + range).toFixed(2));
  const maxRate = referencePrice ? range / referencePrice * 100 : 0;
  const categories = data.map((point) => point.date);

  return {
    animation: false,
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross" },
      formatter: intradayTooltip,
      backgroundColor: theme.surface,
      borderColor: theme.border,
      textStyle: { color: theme.foreground },
    },
    legend: {
      top: 4,
      right: 12,
      textStyle: { color: theme.muted },
      data: ["分时价", "成交量"],
    },
    grid: [
      { left: 58, right: 58, top: 38, height: "63%" },
      { left: 58, right: 58, top: "76%", height: "14%" },
    ],
    xAxis: [
      {
        type: "category",
        data: categories,
        boundaryGap: false,
        axisLine: { lineStyle: { color: theme.border } },
        axisTick: { show: false },
        axisLabel: {
          color: theme.muted,
          formatter: (value: string) => intradayAxisLabel(value, mode),
          hideOverlap: true,
        },
      },
      {
        type: "category",
        gridIndex: 1,
        data: categories,
        boundaryGap: false,
        axisLabel: { show: false },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: theme.border } },
      },
    ],
    yAxis: [
      {
        type: "value",
        min: minPrice,
        max: maxPrice,
        scale: true,
        splitNumber: 4,
        axisLabel: { color: theme.muted, formatter: (value: number) => value.toFixed(2) },
        splitLine: { lineStyle: { color: "rgba(135, 134, 127, 0.16)" } },
      },
      {
        type: "value",
        min: -maxRate,
        max: maxRate,
        splitNumber: 4,
        position: "right",
        axisLabel: {
          formatter: (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(2)}%`,
          color: (value: number) => value >= 0 ? theme.accent : theme.down,
        },
        splitLine: { show: false },
      },
      {
        type: "value",
        gridIndex: 1,
        splitNumber: 2,
        axisLabel: { color: theme.muted },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: "分时价",
        type: "line",
        data: data.map((point) => point.close),
        symbol: "none",
        smooth: false,
        lineStyle: { width: 1.4, color: "#5b9bd5" },
        areaStyle: { color: "rgba(91, 155, 213, 0.10)" },
        markLine: {
          silent: true,
          symbol: "none",
          label: {
            show: true,
            formatter: "昨收",
            color: theme.muted,
            position: "insideEndTop",
          },
          lineStyle: { color: theme.muted, type: "dashed", width: 1 },
          data: [{ yAxis: referencePrice }],
        },
      },
      {
        name: "成交量",
        type: "bar",
        xAxisIndex: 1,
        yAxisIndex: 2,
        data: data.map((point, index) => ({
          value: point.volume,
          itemStyle: {
            color: point.close >= (data[index - 1]?.close ?? point.open)
              ? "rgba(201, 100, 66, 0.62)"
              : "rgba(47, 127, 104, 0.62)",
          },
        })),
      },
    ],
  };
}

function candlestickOption(data: KlinePoint[], theme: ChartTheme) {
  const start = data.length > 80 ? 45 : 0;

  return {
    animation: true,
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross" },
      formatter: candlestickTooltip,
      backgroundColor: theme.surface,
      borderColor: theme.border,
      textStyle: { color: theme.foreground },
    },
    legend: {
      top: 4,
      right: 12,
      textStyle: { color: theme.muted },
      data: ["K线", "MA5", "MA10", "成交量"],
    },
    grid: [
      { left: 48, right: 18, top: 38, height: "54%" },
      { left: 48, right: 18, top: "71%", height: "14%" },
    ],
    dataZoom: [
      {
        type: "inside",
        xAxisIndex: [0, 1],
        start,
        end: 100,
        minSpan: 8,
        zoomOnMouseWheel: true,
        moveOnMouseMove: true,
        moveOnMouseWheel: true,
      },
      {
        type: "slider",
        xAxisIndex: [0, 1],
        start,
        end: 100,
        minSpan: 8,
        height: 22,
        bottom: 10,
        borderColor: theme.border,
        fillerColor: "rgba(201, 100, 66, 0.16)",
        handleStyle: {
          color: theme.accent,
          borderColor: theme.accent,
        },
        moveHandleStyle: {
          color: "rgba(201, 100, 66, 0.28)",
        },
        dataBackground: {
          lineStyle: { color: theme.border },
          areaStyle: { color: "rgba(135, 134, 127, 0.10)" },
        },
        selectedDataBackground: {
          lineStyle: { color: theme.accent },
          areaStyle: { color: "rgba(201, 100, 66, 0.12)" },
        },
        textStyle: { color: theme.muted },
      },
    ],
    xAxis: [
      {
        type: "category",
        data: data.map((point) => point.date),
        boundaryGap: true,
        axisLine: { lineStyle: { color: theme.border } },
        axisLabel: { color: theme.muted },
      },
      {
        type: "category",
        gridIndex: 1,
        data: data.map((point) => point.date),
        axisLabel: { show: false },
        axisLine: { lineStyle: { color: theme.border } },
      },
    ],
    yAxis: [
      {
        scale: true,
        splitLine: { lineStyle: { color: "rgba(135, 134, 127, 0.16)" } },
        axisLabel: { color: theme.muted },
      },
      {
        scale: true,
        gridIndex: 1,
        splitNumber: 2,
        splitLine: { show: false },
        axisLabel: { color: theme.muted },
      },
    ],
    series: [
      {
        name: "K线",
        type: "candlestick",
        data: data.map((point) => [point.open, point.close, point.low, point.high]),
        itemStyle: {
          color: theme.accent,
          color0: theme.down,
          borderColor: theme.accent,
          borderColor0: theme.down,
        },
      },
      {
        name: "MA5",
        type: "line",
        data: movingAverage(5, data),
        smooth: true,
        symbol: "none",
        lineStyle: { width: 1.6, color: "#b86f22" },
      },
      {
        name: "MA10",
        type: "line",
        data: movingAverage(10, data),
        smooth: true,
        symbol: "none",
        lineStyle: { width: 1.6, color: "#629987" },
      },
      {
        name: "成交量",
        type: "bar",
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: data.map((point) => point.volume),
        itemStyle: { color: "rgba(201, 100, 66, 0.32)" },
      },
    ],
  };
}

export function KlineChart({ data, mode, previousClose }: KlineChartProps) {
  const [chartTheme, setChartTheme] = useState(readChartTheme);
  const isIntraday = mode === "1min" || mode === "5day";

  useEffect(() => {
    const syncChartTheme = () => setChartTheme(readChartTheme());
    const frame = window.requestAnimationFrame(syncChartTheme);
    const observer = new MutationObserver(syncChartTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const option = useMemo(
    () => isIntraday
      ? intradayOption(data, mode, previousClose, chartTheme)
      : candlestickOption(data, chartTheme),
    [chartTheme, data, isIntraday, mode, previousClose],
  );

  return (
    <ReactECharts
      option={option}
      style={{ height: "100%", minHeight: 360, width: "100%" }}
      notMerge
    />
  );
}
