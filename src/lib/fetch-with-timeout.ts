// SCH-600 Phase-5 — wrap outbound fetch calls with an AbortController so a
// hanging upstream (Anthropic, Replicate, Stripe) doesn't keep a Next.js
// request hanging until the platform hard-kills it. Call sites catch the
// AbortError and surface a 504-ish message to the client.

const DEFAULT_TIMEOUT_MS = 30_000;

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const signal = init.signal ?? controller.signal;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Returns true if the thrown error came from an AbortController timeout. */
export function isFetchTimeout(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof Error && err.name === "AbortError") return true;
  return false;
}
