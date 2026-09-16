import {it,expect} from "vitest";
import {LaunchError,launchUserMessage} from "../lib/launches/policy";
it.each(["PORTAL_CHANGED","POINTER_CHANGED","HOOK_CHANGED","PREDICTION","QUOTE_HISTORY","EXECUTION_DISABLED"])("uses public wording for %s",code=>{expect(launchUserMessage(new LaunchError(code,"Internal Portal ABI RPC detail"))).not.toMatch(/Portal|ABI|RPC|Internal/);});
