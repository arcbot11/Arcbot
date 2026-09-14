/** Read-only retries. Never use this for transaction submission. */
export async function retryBalanceRead<T>(read: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await read(); }
    catch (error) {
      if (attempt === 2) throw error;
      await balanceRetryDelay(attempt);
    }
  }
}
export const balanceRetryDelay = (attempt: number) => new Promise<void>(resolve => setTimeout(resolve, (attempt + 1) * 350));
