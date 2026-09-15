import {WebResponseError} from "../web-response-error";
import {tradePreparationError} from "./trade-errors";
export const ESTIMATE_IDLE_MS = 120_000;
export const ESTIMATE_REFRESH_MS = 60_000;
const EXPIRED = "Estimate expired. Change the amount to refresh.";

/** One request at a time. Input changes dispose this cycle and start a new one. */
export function startEstimateRefresh<T extends { expiresAt: number }>(options: {
  autoRefresh: boolean;
  finishInFlightAfterIdle?:boolean;
  request: (signal: AbortSignal) => Promise<T>;
  estimate: (value: T | null) => void;
  status: (message: string) => void;
}) {
  const controller = new AbortController();
  const deadline = Date.now() + ESTIMATE_IDLE_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let idle: ReturnType<typeof setTimeout> | undefined;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  let inFlight=false;
  const dispose = () => {
    controller.abort();
    clearTimeout(timer);
    clearTimeout(idle);
    clearTimeout(expiry);
  };
  const pause = () => {
    dispose();
    options.estimate(null);
    options.status("Estimates paused. Change the amount to refresh.");
  };
  const refresh = async () => {
    if (controller.signal.aborted) return;
    if (options.autoRefresh && Date.now() >= deadline) { pause(); return; }
    options.estimate(null);
    options.status("Estimating…");
    const startedAt = Date.now();
    inFlight=true;
    try {
      const result = await options.request(controller.signal);
      if (controller.signal.aborted) return;
      if (options.autoRefresh && Date.now() >= deadline && !options.finishInFlightAfterIdle) { pause(); return; }
      if (!Number.isFinite(result.expiresAt)) throw Error("Invalid estimate expiry");
      if (result.expiresAt <= Date.now()) {
        options.status(EXPIRED);
        if (options.autoRefresh) timer = setTimeout(() => void refresh(), Math.max(1000,ESTIMATE_REFRESH_MS-(Date.now()-startedAt)));
        return;
      }
      options.estimate(result);
      options.status("");
      expiry = setTimeout(() => {
        if (controller.signal.aborted) return;
        options.estimate(null); options.status(EXPIRED);
      }, result.expiresAt - Date.now());
      if(options.autoRefresh)timer=setTimeout(()=>void refresh(),Math.max(result.expiresAt-Date.now(),ESTIMATE_REFRESH_MS-(Date.now()-startedAt)));
    } catch(error) {
      if (!controller.signal.aborted) {
        clearTimeout(idle);
        options.estimate(null);
        options.status(error instanceof WebResponseError?error.message:tradePreparationError(error)??(error instanceof Error&&/TimeoutError|AbortError/.test(error.name)?"The quote request timed out. Change the amount to retry. No transaction was sent.":"Estimate unavailable. Change the amount to retry."));
      }
    }finally{inFlight=false;}
  };
  options.status("Estimating…");
  if (options.autoRefresh) idle = setTimeout(()=>{if(!options.finishInFlightAfterIdle||!inFlight)pause();}, ESTIMATE_IDLE_MS);
  timer = setTimeout(() => void refresh(), 500);
  return dispose;
}
