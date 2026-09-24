import { parseLaunchInput, type LaunchInput } from "./input";
import { LAUNCH_MIN_DEV_BUY_USDC } from "./policy";
import type { LaunchPreview } from "./prepare";

export type LaunchDraft = {
  requestId: string; address: string; revision: number; run?: import("./execution-types").LaunchRun; status: "draft" | "prepared" | "cancelled" | "executing" | "completed";
  input: LaunchInput; tokenSalt: string; fingerprint: string; preview: LaunchPreview | null;
  expiresAt: number; executionEnabled: false;
};
export type LaunchForm = {
  pairToken?: LaunchInput["pairToken"]; name: string; symbol: string; imageURI: string; description: string;
  website: string; twitter: string; telegram: string; allocationText: string; devBuyUSDC: string;
};
export const emptyLaunchForm: LaunchForm = {
  name: "", symbol: "", imageURI: "", description: "", website: "", twitter: "", telegram: "", allocationText: "", devBuyUSDC: LAUNCH_MIN_DEV_BUY_USDC,
};
export function formInput(form: LaunchForm): LaunchInput {
  return parseLaunchInput({ ...form, imageURI: form.imageURI.trim(), devBuyUSDC: form.devBuyUSDC.trim() || LAUNCH_MIN_DEV_BUY_USDC });
}
export function allocationSummary(input: LaunchInput) {
  return [
    { label: "Creator", bps: input.creatorBps }, { label: "Buyback and burn", bps: input.burnBps },
    { label: "Holder dividends", bps: input.dividendBps }, { label: "Liquidity", bps: input.liquidityBps },
  ].map(row => ({ ...row, percent: `${row.bps / 100}%` }));
}
export function draftForm(input: LaunchInput): LaunchForm {
  const { pairToken, name, symbol, imageURI, description, website, twitter, telegram, devBuyUSDC } = input;
  return { pairToken, name, symbol, imageURI, description, website, twitter, telegram, devBuyUSDC,
    allocationText: `${input.creatorBps / 100}% creator, ${input.burnBps / 100}% burn, ${input.dividendBps / 100}% holders, ${input.liquidityBps / 100}% liquidity` };
}
export function currentLaunchPreview(draft: LaunchDraft, now: number) {
  const p = draft.preview;
  return draft.status === "prepared" && draft.expiresAt > now && p && p.expiresAt > now && p.createdAt <= now
    && p.fingerprint === draft.fingerprint && p.creator.toLowerCase() === draft.address.toLowerCase()
    && p.tokenSalt === draft.tokenSalt && p.executionEnabled === false ? p : null;
}
