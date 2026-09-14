export const recoveryTerminal=(status:string)=>['completed','reverted','cancelled'].includes(status);
export function recoveryDelay(attempt:number){return Math.min(30_000,5_000*2**Math.min(3,Math.max(0,attempt)));}
export const RECOVERY_LEASE_MS=90_000;
export const BROADCAST_INTERVAL_MS=5_000;
