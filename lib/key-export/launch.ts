/** Telegram appends signed launch data to the fragment. Never persist it. */
export function exportLaunch(fragment:string){
  const raw=fragment.replace(/^#/,"");
  const fields=new URLSearchParams(raw);
  if(fields.getAll("ticket").length>1||fields.getAll("tgWebAppData").length>1)throw Error("Invalid export link.");
  const ticket=fields.get("ticket")??(/^[a-f0-9]{64}$/.test(raw)?raw:undefined);
  if(ticket&&!/^[a-f0-9]{64}$/.test(ticket))throw Error("Invalid export link.");
  const telegramData=fields.get("tgWebAppData")??undefined;
  if(telegramData&&telegramData.length>12000)throw Error("Invalid Telegram proof.");
  return {ticket,telegramData};
}
