/** Only the original browser's HttpOnly export cookie can resume the grant.
 * OAuth handoffs carry its PKCE-bound callback, never the export credentials. */
export function exportBrowserLinks(origin:string,userAgent:string,callback?:URL){
  const target=callback??new URL("/api/key-export/view",origin);
  if(target.origin!==origin||!["/api/key-export/view","/api/key-export/callback"].includes(target.pathname))throw Error("Invalid export return.");
  if(target.protocol!=="https:")throw Error("Invalid export origin.");
  const android=/Android/i.test(userAgent),ios=/iPhone|iPad|iPod/i.test(userAgent);
  if(!android&&!ios)return "";
  const escape=(s:string)=>s.replaceAll("&","&amp;").replaceAll('"',"&quot;").replaceAll("<","&lt;").replaceAll(">","&gt;");
  const firefox=android?`intent://${target.host}${target.pathname}${target.search}#Intent;scheme=https;package=org.mozilla.firefox;end`:`firefox://open-url?url=${encodeURIComponent(target.href)}`;
  const chrome=android?`intent://${target.host}${target.pathname}${target.search}#Intent;scheme=https;package=com.android.chrome;end`:`googlechromes://${target.host}${target.pathname}${target.search}`;
  return `<p>Finish in browser: <a href="${escape(firefox)}" rel="noreferrer">Firefox</a> · <a href="${escape(chrome)}" rel="noreferrer">Chrome</a>. Use the browser and normal or private mode where you started. If it does not open, return to that browser and reopen this page. </p>`;
}
