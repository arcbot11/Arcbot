/** Operator metadata only. Never use a username to authorize or select a wallet. */
export function telegramOperatorProfile(updateJson:string|undefined,userId:string,chatId:string,observedAt:number){
  if(!updateJson||userId!==chatId)return null;
  try{
    const update=JSON.parse(updateJson);
    const from=update.callback_query?.from??update.message?.from;
    const chat=update.callback_query?.message?.chat??update.message?.chat;
    if(!Number.isSafeInteger(from?.id)||String(from.id)!==userId||from.is_bot||chat?.type!=="private"||String(chat.id)!==chatId)return null;
    if(from.username!==undefined&&(typeof from.username!=="string"||!/^[A-Za-z0-9_]{1,32}$/.test(from.username)))return null;
    return {telegramUsername:from.username as string|undefined,telegramUsernameUpdatedAt:observedAt};
  }catch{return null;}
}
