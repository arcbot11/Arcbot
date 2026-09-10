import { ARC_BOT_USERNAME, ARC_BOT_X_USER_ID } from "./project-config";
export function xBotUsername() { return ARC_BOT_USERNAME; }
export function xBotUserId() { return ARC_BOT_X_USER_ID; }
/** Author identity only. Mentioning the bot in another user's text is not a self-post. */
export function isXBotAuthor(userId?:string,username?:string){
  const id=userId?.trim();
  return id===ARC_BOT_X_USER_ID
    ||username?.trim().replace(/^@/,"").toLowerCase()===ARC_BOT_USERNAME.toLowerCase();
}
