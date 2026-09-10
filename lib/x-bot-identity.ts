export function xBotUsername() {
  const username = process.env.X_BOT_USERNAME?.trim().replace(/^@/, "") || "ArcChainBot";
  if (!/^[A-Za-z0-9_]{1,15}$/.test(username)) throw new Error("Invalid X bot username.");
  return username;
}
