"use client";

/** One transport boundary for browser-to-Next.js API requests. */
export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    cache: "no-store",
    ...init,
    headers: init?.body
      ? { "content-type": "application/json", ...init.headers }
      : init?.headers,
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const detail = typeof payload === "object" && payload !== null
      ? (payload as { detail?: string; error?: string }).detail
        ?? (payload as { error?: string }).error
      : undefined;
    throw new Error(detail ?? `请求失败（${response.status}）`);
  }
  return payload as T;
}
