import {ConvexError} from "convex/values";
// Only these codes/messages may leave the broker. Never forward provider bodies.
export const exportErrors={
  UNAVAILABLE:{status:503,message:"Key export is not configured. Contact Argos Bot support."},
  REGISTRY_NOT_READY:{status:503,message:"Wallet export eligibility is being checked. Try later."},
  ELIGIBILITY:{status:403,message:"Wallet export eligibility has not been verified. Contact Argos Bot support."},
  TG_SELECTION:{status:409,message:"Select your TG linked wallet first. X wallet keys require X verification on the website."},
  TG_DELIVERY_RETRY:{status:503,message:"Telegram delivery could not be confirmed. Wait for the message, or send /export again."},
  TG_CONFIRMATION:{status:410,message:"Export confirmation expired or changed. Use /export again."},
  BROWSER_MISMATCH:{status:403,message:"Return to the browser where you started export."},
  AUTHORIZATION:{status:403,message:"Export authorization changed. Return to your wallet and start again."},
  EXPIRED:{status:410,message:"Export authorization expired. Return to your wallet and start again."},
  RATE_LIMITED:{status:429,message:"Export limit reached. Try again in an hour."},
  PENDING_TRANSACTIONS:{status:409,message:"Finish pending wallet transactions before exporting."},
  BUSY:{status:409,message:"Verification is in progress. Wait 30 seconds, then retry."},
  OAUTH_RESTART:{status:409,message:"X verification was interrupted. Return to the original export page and verify with X again."},
  PROVIDER_RETRY:{status:503,message:"The provider did not confirm the request. Retry on this page. No key is shown."},
} as const;
export type ExportErrorCode=keyof typeof exportErrors;
// ConvexError preserves the intentional safe payload in production, where
// ordinary Error details can be redacted by the framework.
export function exportFail(code:ExportErrorCode):never{throw new ConvexError(`[wallet-export:${code}] ${exportErrors[code].message}`);}
export function safeExportError(error:unknown,fallback:ExportErrorCode="AUTHORIZATION"){
  const payload=error&&typeof error==="object"&&"data" in error&&typeof error.data==="string"?error.data:error instanceof Error?error.message:"";
  const tag=/\[wallet-export:([A-Z_]+)\]/.exec(payload)?.[1];
  const code=tag&&Object.hasOwn(exportErrors,tag)?tag as ExportErrorCode:fallback;
  return {code,...exportErrors[code]};
}
