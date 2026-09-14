/** Read-only retries. Never use this for transaction submission. */
export async function retryBalanceRead<T>(read: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await read(); }
    catch (error) {
      // The Arc transport already exhausted its bounded provider/read retries.
      // Retrying that whole stack here multiplies one miss into nine RPC calls.
      let cause:unknown=error;
      for(let depth=0;cause&&depth<8;depth++){
        if(cause instanceof Error&&cause.message.includes("No healthy Arc RPC supports this request"))throw error;
        cause=typeof cause==="object"&&cause!==null&&"cause" in cause?cause.cause:undefined;
      }
      if (attempt === 2) throw error;
      await balanceRetryDelay(attempt);
    }
  }
}
export const balanceRetryDelay = (attempt: number) => new Promise<void>(resolve => setTimeout(resolve, (attempt + 1) * 350));
