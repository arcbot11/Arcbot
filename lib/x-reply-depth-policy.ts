export function exceedsXReplyDepthLimit(input: {
  replyDepth: number;
  maximumDepth: number;
  guidedWorkflow: boolean;
  contextualGasHelp: boolean;
  expectedGasResumeReply: boolean;
  ownedBotSelfWalletRequest?: boolean;
  directedInformationalHelp?: boolean;
  explicitBotMention?: boolean;
}) {
  if (input.explicitBotMention) return false;
  if (input.replyDepth < input.maximumDepth) return false;
  // Owner-bound guided workflows are intentionally allowed to continue beyond
  // the ordinary anti-loop cutoff. Their own TTL, ownership, per-user workflow
  // allowance, and X account limits remain in force.
  return !input.guidedWorkflow
    && !input.contextualGasHelp
    && !input.expectedGasResumeReply
    && !input.ownedBotSelfWalletRequest
    && !input.directedInformationalHelp;
}
