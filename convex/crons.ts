import { cronJobs, makeFunctionReference } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// X jobs exit before contacting X unless replies are explicitly enabled.
crons.interval("poll direct X mentions", { minutes: 1 }, internal.xReplies.pollMentions);
crons.interval("recover queued X publications", { minutes: 1 }, internal.xReplyQueue.kick);
crons.interval("recover interrupted X interactions", { minutes: 5 }, internal.xReplies.recoverStaleInteractions);
crons.interval("recover Telegram wallet result delivery", { minutes: 1 }, internal.telegramDeliveries.recover);
crons.interval("maintain registry migrations", { hours: 1 }, internal.registry.ensureInitialized);

crons.interval("settle website OTC orders", { minutes: 1 }, makeFunctionReference<"action">("otc:tick"));

export default crons;
