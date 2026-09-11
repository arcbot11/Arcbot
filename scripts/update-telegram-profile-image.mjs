import sharp from "sharp";

// https://core.telegram.org/bots/api#setmyprofilephoto
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required");
async function request(method, body) {
  let response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST", body, signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new Error(`Telegram ${method} request unavailable`);
  }
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(`Telegram ${method} failed (${response.status})`);
  return result.result;
}
const bot = await request("getMe");
if (String(bot.id) !== "8280311402") throw new Error("Telegram bot identity does not match this project");
const photo = await sharp("public/brand/argos-dog-logo.png").resize(1024, 1024).jpeg({ quality: 95 }).toBuffer();
const form = new FormData();
form.set("photo", JSON.stringify({ type: "static", photo: "attach://avatar" }));
form.set("avatar", new Blob([photo], { type: "image/jpeg" }), "argos-bot.jpg");
const updated = await request("setMyProfilePhoto", form);
console.log(JSON.stringify({ status: updated ? "profile image updated" : "unconfirmed", name: bot.first_name, username: bot.username }));
