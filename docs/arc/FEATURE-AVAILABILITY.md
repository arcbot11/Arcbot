# Feature availability

Website OTC has no rollout enable flag. It requires configured RPCs, signing credentials, storage, worker, and a fee recipient. New positions use dedicated CDP escrow wallets; legacy positions still require their verified Base payment contract. Arc sends and Base withdrawals do not require OTC payment configuration.

Authentication, gas limits, quote expiry, balance reservations, simulations, and finalized receipt verification remain enforced. Pending settlement funds remain reserved.

Token creation remains blocked. The legacy chain 4663 executor remains gated and is not an Arc execution path.

Website buy/sell controls still lack a trade-submission handler. Their disabled state reflects missing execution infrastructure, not a rollout flag. Mixed V3/V4 execution and V4 multihop quotes remain unsupported.

These source changes do not deploy a backend or verify funded settlement. Configure a separate Argos Bot backend before deployment; the inherited backend is not an Arc deployment target.
