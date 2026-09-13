import {execFileSync} from "node:child_process";
import {expect,it} from "vitest";

it("imports recovery in native Node strip-only mode without invoking wallet operations",()=>{
 const output=execFileSync(process.execPath,["--import","./scripts/register-typescript.mjs","--input-type=module","-e",
   "await import('./lib/otc/runtime.ts'); await import('./lib/otc/recovery-runtime.ts'); console.log('runtime-import-ok');"],
   {cwd:process.cwd(),encoding:"utf8",timeout:20000,stdio:["ignore","pipe","pipe"]});
 expect(output.trim()).toBe("runtime-import-ok");
});
