import { NextResponse } from "next/server";
import { fetchMarketData } from "@/lib/python-market";

export async function GET() {
  try {
    return NextResponse.json(await fetchMarketData("/api/backtests/hikyuu/status"));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法检查历史数据" }, { status: 502 });
  }
}
