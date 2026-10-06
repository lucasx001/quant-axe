import { NextResponse } from "next/server";
import { fetchMarketData } from "@/lib/python-market";

const baseUrl = process.env.MARKET_API_BASE_URL ?? "http://127.0.0.1:8000";

export async function GET() {
  try {
    return NextResponse.json(await fetchMarketData("/api/backtests"));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法读取回测记录" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  try {
    const response = await fetch(`${baseUrl}/api/backtests`, {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: await request.text(),
      signal: AbortSignal.timeout(20_000),
    });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法创建回测" }, { status: 502 });
  }
}
