# X direct mentions

Direct tags of @TheArgosBot bypass the conversation-depth cutoff and the intent restrictions for nested replies. Untagged/inherited thread replies still use the passive-conversation rules. Queued interactions with the old nested-reply flag also honor a direct tag.

Wallet, balance, show-my-wallet, country and manual verified-only retrieval filters are disabled in code, including stale environment flags. The automatic wallet exclusion overlay is ignored.

The existing opt-in emergency guard remains: 60 unique posts in 10 minutes activates its three-hour overlay without extending it on each poll. Emergency search uses is:verified, and admission additionally requires the profile's Premium or PremiumPlus subscription. After expiry, normal mentions retrieval resumes. Pagination tokens are reset when endpoints change.

X_BOT_USERNAME can override the TheArgosBot default. Disabled token-creation workflows remain disabled. No live X calls or backend deployment were performed for this change.
