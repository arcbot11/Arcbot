/** Retry read-only preparation only. Never wraps signing or broadcasting. */
export function operatorQuoteMoved(error: unknown): boolean {
  const seen = new Set<unknown>();
  while (error && typeof error === "object" && !seen.has(error)) {
    seen.add(error);
    const e = error as { data?: unknown; cause?: unknown };
    // V4TooLittleReceived(uint256,uint256): refresh the price, not the slippage.
    if (typeof e.data === "string" && /^0x8b063d73[0-9a-f]{128}$/i.test(e.data)) return true;
    error = e.cause;
  }
  return false;
}
export function retryableOperatorPreviewError(error: unknown): boolean {
  if (operatorQuoteMoved(error)) return true;
  let current: unknown = error;
  let retryable = false;
  const seen = new Set<unknown>();
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const e = current as { name?: string; message?: string; code?: number; data?: unknown; cause?: unknown };
    if (e.code === 3 || /revert/i.test(e.name ?? "") || /execution reverted/i.test(e.message ?? "") ||
      (typeof e.data === "string" && /^0x[0-9a-f]{8}/i.test(e.data))) return false;
    if (["UnknownRpcError", "TimeoutError", "HttpRequestError"].includes(e.name ?? "") || e.code === -32098) retryable = true;
    current = e.cause;
  }
  return retryable;
}

export async function prepareOperatorPreview<T>(prepare: () => Promise<T>, retry: (attempt: number) => Promise<void>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try { return await prepare(); }
    catch (error) {
      if (attempt >= 5 || !retryableOperatorPreviewError(error)) throw error;
      await retry(attempt);
    }
  }
}
