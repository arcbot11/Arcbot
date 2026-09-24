# Portal 8 integration verification

Contract reference: https://argus.world/docs/portal-8-contracts
Creator fee behavior: https://argus.world/docs/portal-8-creator-fees
Verified source and ABI: https://arc.etherscan.io/address/0xeed7559B8A6ABf64427dc41Cb5cc6400109C5D93#code

New launch preparation targets Portal 8. Saved Portal 7 runs retain their original encoding and receipt checks. Portal 8 creates tokens through factories, so the token address is obtained from the canonical receipt; the hook and escrow remain pinned before execution. The adapter verifies deployed code hashes, factories, salt predictions, quote admission, minimum seed, allowance, balance, gas, nonce, simulation and receipt evidence. Registry economics are frozen with the accepted preview and rechecked before signing.

The opening buy defaults to 4.50 USDC. Explicit smaller amounts fail. A larger buy includes the minimum. Non-USDC pairs additionally satisfy the registry's live quote-denominated seed minimum. Portal 8's bounded deployment allowance is 12 million gas; the aggregate setup/launch spend cap remains 0.50 USDC. A real Portal 8 launch used 7,859,343 gas, so the old five-million limit was insufficient.

Fee destinations are grounded in the original post and persisted with the accepted launch. X handles resolve to an immutable X ID and an Argos wallet, provisioning the recipient wallet if necessary. GitHub profile or repository URLs resolve their owner to a numeric GitHub user ID and the portal's deterministic identity vault. GitHub organizations are rejected until their claim authority is supported. Changing handles does not re-resolve a saved destination on retry.

Portal 8 claims call only claimCreator(), never distribute/crank. Eligibility is checked against the current registry control address, payout split, or accepted identity payout. Signed claims retain their destination evidence. Settlement amounts include only receipts delivered to the requesting wallet; a payout to a GitHub vault is not represented as a wallet withdrawal. Vault withdrawal and identity attestation remain separate.

Claims are deliberately one launch per request. Untargeted requests discover eligible launches and ask for a ticker/contract when more than one is present, or discovery is incomplete. The AI schema and prompt no longer promise bulk execution.

Public transaction 0xb044648aa5ca14a4eb98fa9bfd25c181c01d491e7b6550fe2cdb1849848e05e9 was read without signing or broadcasting. Its calldata round-trips through the verified ABI; local escrow/init-code predictions match on-chain values; receipt verification confirms 5 USDC spent, no refund, and 2011470.160369901061609419 launch tokens delivered. Its public evidence is saved in tests/fixtures/portal8-live.json.

No deployment, wallet transaction, X post, or live recipient-wallet provisioning was performed during this verification.
