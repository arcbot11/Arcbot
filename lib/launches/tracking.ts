import type { LaunchDraft } from "./form";

export function awaitingLaunchAcceptance(draft:LaunchDraft, uncertainId:string|null){
  return uncertainId===draft.requestId&&!draft.run&&!["cancelled","completed"].includes(draft.status);
}
export function launchTrackingId(draft:LaunchDraft|null,uncertainId:string|null){
  return uncertainId??(draft?.run?.status==="running"?draft.requestId:null);
}
export function canStartNewLaunchDraft(draft:LaunchDraft,now:number){
  return draft.status==="cancelled"||draft.status==="completed"||draft.run?.status==="blocked"||
    (draft.expiresAt<=now&&draft.status!=="executing"&&draft.run?.status!=="running");
}
