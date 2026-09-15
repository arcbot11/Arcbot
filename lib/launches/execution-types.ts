import type { LaunchInput } from "./input";
import type { LaunchPreview } from "./prepare";
export type LaunchStepTerms = { requestId: string; index: number; kind: "rewards" | "approval" | "launch"; input: LaunchInput; preview: LaunchPreview };
export type VerifiedLaunch = { hash: string; token: string; creator: string; portal: string; hook: string; splitter: string; locker: string; poolId: string; blockNumber: string; devBuyReceived: string; quoteSpent: string; quoteRefunded: string };
export type LaunchRun = { requestId: string; owner: string; address: string; input: LaunchInput; preview: LaunchPreview;
  sourceRequestId?: string; status: "running" | "completed" | "blocked"; steps: string[]; result?: VerifiedLaunch; note?: string };
export const launchTransactionId = (owner: string, requestId: string, index: number) => `launch:${owner}:${requestId}:${index}`;
