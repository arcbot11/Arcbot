import { cronJobs, makeFunctionReference } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.interval("clean up expired web sign-ins", { minutes: 1 }, internal.webAuth.cleanup);
crons.interval("recover TG native wallet commands", { minutes: 1 }, internal.telegramWallets.recover);
crons.interval("recover interrupted Telegram intake", { minutes: 1 }, internal.telegram.recoverUpdates);

// X jobs exit before contacting X unless replies are explicitly enabled.
crons.interval("poll direct X mentions", { seconds: 30 }, internal.xReplies.pollMentions);
crons.interval("recover queued X publications", { minutes: 1 }, internal.xReplyQueue.kick);
crons.interval("recover interrupted X interactions", { minutes: 5 }, internal.xReplies.recoverStaleInteractions);
crons.interval("recover Telegram wallet result delivery", { minutes: 1 }, internal.telegramDeliveries.recover);
crons.interval("maintain registry migrations", { hours: 1 }, internal.registry.ensureInitialized);

crons.interval("settle website OTC orders", { minutes: 1 }, makeFunctionReference<"action">("otc:tick"));

export default crons;
