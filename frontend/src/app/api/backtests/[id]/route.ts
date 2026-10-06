import { NextResponse } from "next/server";
import { fetchMarketData } from "@/lib/python-market";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    return NextResponse.json(await fetchMarketData(`/api/backtests/${encodeURIComponent(id)}`));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法读取回测结果" }, { status: 502 });
  }
}
