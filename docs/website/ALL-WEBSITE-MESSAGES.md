# Website message printout

Generated from the current local source on 2026-09-11T15:53:49.797Z. This is a source inventory, not a capture of the live deployment.

Includes visible page text, button labels, fields, accessibility text, notifications, confirmation templates, validation errors and website API text. Entries are grouped by source file; each has its source line for editing. Repeated text within a file is listed once per category.

## Reading dynamic messages

Text inside {braces} is a runtime expression: an amount, token ticker, wallet address, status, or another message. Conditional expressions list the source alternatives. JSX may assemble one sentence from multiple adjacent entries; these fragments are retained so none are silently dropped. A token, user's X name, provider error or transaction result supplied at runtime cannot be printed as a finite list. Browser-native required-field/number validation also depends on the browser and language.

## Backend visibility

The supporting-message section is an audit appendix, not a claim that every internal error is displayed verbatim. In particular, lib/otc/http.ts maps configuration and network failures to fixed website messages and replaces other disallowed errors with “Request could not be confirmed. Check order or transaction history before retrying.” Direct WebError text and permitted prefixes can pass through. Social-only API routes are labeled by their source paths and are not ordinary website UI. Convex and third-party errors may also be replaced with generic text.

This extraction follows local imports from all app routes, plus the OTC storage boundary. It excludes secrets, environment files, test fixtures, comments, imports, CSS classes, type-only strings and logging-only messages. Shared libraries can contain additional non-website branches; their text is included conservatively in the appendix.

**1815 text entries across 136 files.**


## Pages and shared metadata


### app/error.tsx

- **Line 10 · Visible text:** Argos Bot
- **Line 10 · Visible text:** Page unavailable.
- **Line 10 · Visible text:** Retrying automatically.
- **Line 10 · Visible text:** Retry

### app/guide/page.tsx

- **Line 2 · Text / template:** Argos Bot examples for buying, selling, swapping, and sending Arc tokens.
- **Line 7 · Text / template:** Buy
- **Line 7 · Text / template:** Buy $25 of TOKEN
- **Line 7 · Text / template:** Buy 50 TOKEN
- **Line 7 · Text / template:** Use USDC to buy an Arc token.
- **Line 8 · Text / template:** Sell
- **Line 8 · Text / template:** Sell $25 of TOKEN
- **Line 8 · Text / template:** Sell 50 TOKEN
- **Line 8 · Text / template:** Sell tokens back to USDC.
- **Line 9 · Text / template:** Swap
- **Line 9 · Text / template:** Swap $25 of TOKEN_A for TOKEN_B
- **Line 9 · Text / template:** Swap 50 TOKEN_A for TOKEN_B
- **Line 9 · Text / template:** Choose the input token, amount, and output token.
- **Line 10 · Text / template:** Send
- **Line 10 · Text / template:** Send $25 of TOKEN to 0x…
- **Line 10 · Text / template:** Send 50 TOKEN to 0x…
- **Line 10 · Text / template:** Check the destination and amount.
- **Line 11 · Text / template:** Burn
- **Line 11 · Text / template:** Burn $25 of TOKEN
- **Line 11 · Text / template:** Burn 50 TOKEN
- **Line 11 · Text / template:** Send tokens to the dead address. This cannot be undone.
- **Line 16 · Visible text:** THE FIELD GUIDE
- **Line 17 · Visible text:** Your Arc Chain Toolkit
- **Line 18 · Visible text:** Post commands on X or use our TG bot or web for any Arc chain transaction. Use a ticker or contract address.
- **Line 20 · Visible text:** 0
- **Line 20 · Composed display template:** {name}
- **Line 21 · Visible text:** Dollar value
- **Line 21 · Composed display template:** {dollars}
- **Line 21 · Visible text:** Token amount
- **Line 21 · Composed display template:** {tokens}
- **Line 22 · Composed display template:** {description}

### app/layout.tsx

- **Line 12 · Text / template:** Argos Bot
- **Line 17 · Text / template:** Arc Chain
- **Line 17 · Text / template:** Arc wallet
- **Line 17 · Text / template:** USDC
- **Line 17 · Text / template:** Arc token swaps

### app/manifest.ts

- **Line 5 · Text / template:** Argos Bot
- **Line 7 · Text / template:** Buy, sell, swap, and send tokens on Arc.

### app/not-found.tsx

- **Line 6 · Visible text:** 404
- **Line 7 · Visible text:** Page not found.
- **Line 8 · Visible text:** Return to Argos Bot

### app/otc/page.tsx

- **Line 6 · Text / template:** Buy Arc USDC with Base ETH. Review listings, premiums, and fees.
- **Line 7 · Visible text:** ARGOS BOT / OTC MARKET
- **Line 7 · Visible text:** Get Arc USDC Early
- **Line 7 · Visible text:** Buy Arc USDC with Base ETH.
- **Line 7 · Visible text:** Set your amount. Check the premium. Trade.
- **Line 7 · Visible text:** 01
- **Line 7 · Visible text:** Fund your wallet
- **Line 7 · Visible text:** Arc USDC to sell. Base ETH to buy. Keep Base ETH for gas.
- **Line 7 · Visible text:** 02
- **Line 7 · Visible text:** Agree on the amount
- **Line 7 · Visible text:** Buy part or all of a listing. Premium and 1.5% service fee are included in the quote.
- **Line 7 · Visible text:** 03
- **Line 7 · Visible text:** Track both transfers
- **Line 7 · Visible text:** USDC and Base assets are securely escrowed and settled upon successful payment.

### app/page.tsx

- **Line 4 · Visible text:** ARGOS BOT
- **Line 4 · Visible text:** Your gateway
- **Line 4 · Visible text:** to
- **Line 4 · Visible text:** Arc Chain
- **Line 4 · Visible text:** Your Arc Chain Wallet
- **Line 4 · Visible text:** Explore Argos Bot ↓
- **Line 4 · Accessibility / field text:** Argos Bot silver dog
- **Line 4 · Visible text:** 01 / ARC
- **Line 4 · Visible text:** 01 / THE TOOLKIT
- **Line 4 · Visible text:** Your Arc Chain Toolkit
- **Line 4 · Text / template:** Buy & sell
- **Line 4 · Text / template:** Buy and sell any token on Arc chain on X, TG, and web
- **Line 4 · Text / template:** Swap
- **Line 4 · Text / template:** Swap between any Arc chain tokens
- **Line 4 · Text / template:** Send
- **Line 4 · Text / template:** Send USDC or Arc chain tokens to any user on X, or any wallet on X, TG, and web
- **Line 4 · Text / template:** Burn
- **Line 4 · Text / template:** Burn any Arc chain tokens
- **Line 4 · Composed display template:** 0{i + 1}
- **Line 4 · Visible text:** 0
- **Line 4 · Composed display template:** {title}
- **Line 4 · Composed display template:** {copy}
- **Line 4 · Visible text:** 02 / THE ECOSYSTEM
- **Line 4 · Visible text:** See What&apos;s on Arc Chain
- **Line 4 · Visible text:** Follow token activity on Arc Explorer.
- **Line 4 · Visible text:** Arc Explorer ↗

### app/privacy/page.tsx

- **Line 5 · Text / template:** How Argos Bot collects, uses, shares, and protects information.
- **Line 8 · Text / template:** About this policy
- **Line 8 · Text / template:** This Privacy Policy explains how Argos Bot collects, uses, shares, and protects information when you visit the Argos Bot website, connect an X account, use an Argos Bot wallet, submit commands, or otherwise use our services.
- **Line 8 · Text / template:** Questions or privacy requests may be sent to Argos Bot support.
- **Line 9 · Text / template:** Information we collect
- **Line 9 · Text / template:** X account information needed to authenticate you, receive commands, and provide responses.
- **Line 9 · Text / template:** Public wallet and blockchain information, including addresses, balances, transaction hashes, token activity, and fee activity.
- **Line 9 · Text / template:** Content you provide, including X posts, wallet requests, token details, images, links, wallet destinations, and support messages.
- **Line 10 · Text / template:** How we use information
- **Line 10 · Text / template:** Provide wallets and carry out the actions you request.
- **Line 10 · Text / template:** Display wallet, token, transaction, fee, and liquidity information.
- **Line 10 · Text / template:** Authenticate sessions, prevent abuse, secure the service, diagnose failures, and improve reliability.
- **Line 10 · Text / template:** Respond to support requests and comply with legal obligations.
- **Line 11 · Text / template:** Public blockchain information
- **Line 11 · Text / template:** Blockchain networks are public. Wallet addresses, transactions, token activity, smart-contract interactions, and related records may remain permanently visible through block explorers, nodes, indexers, and other independent services. Argos Bot cannot alter or delete information recorded on a public blockchain.
- **Line 12 · Text / template:** How information is shared
- **Line 12 · Text / template:** Argos Bot does not sell personal information. Information may be provided to infrastructure and service providers where needed to operate the service, process your instructions, prevent abuse, or comply with law.
- **Line 12 · Text / template:** X and authentication providers.
- **Line 12 · Text / template:** Wallet infrastructure, blockchain networks, RPC providers, smart contracts, and block explorers.
- **Line 12 · Text / template:** Hosting, database, security, analytics, AI, market-data, market-data providers.
- **Line 13 · Text / template:** Third-party services
- **Line 13 · Text / template:** Features may interact with independent services such as X, Coinbase Developer Platform, Arc, CoinGecko, GeckoTerminal, Blockscout, and other wallet, market-data, or blockchain providers. Their own terms and privacy practices apply to information they process.
- **Line 16 · Accessibility / field text:** Privacy Policy

### app/terms/page.tsx

- **Line 5 · Text / template:** Terms that apply when accessing or using Argos Bot.
- **Line 8 · Text / template:** Agreement
- **Line 8 · Text / template:** These Terms of Use govern your access to the Argos Bot website and Argos Bot features offered through the website, X, wallets, and related services. By using Argos Bot, you agree to these Terms and the Privacy Policy. If you do not agree, do not use the service.
- **Line 9 · Text / template:** About Argos Bot
- **Line 9 · Text / template:** Argos Bot provides software for creating and viewing wallets and for requesting interactions with tokens, public blockchains, smart contracts, and third-party services. Argos Bot is independent and is not operated or endorsed by Arc, X, or Coinbase.
- **Line 9 · Text / template:** Argos Bot contact details will be published before release.
- **Line 10 · Text / template:** Eligibility
- **Line 10 · Text / template:** You must be at least 18 years old, have legal capacity to agree to these Terms, and be permitted to use Argos Bot under the laws that apply to you. You may not use the service where its use would be unlawful, including in violation of sanctions or export restrictions.
- **Line 11 · Text / template:** Wallets and account security
- **Line 11 · Text / template:** An Argos Bot wallet may be associated with your authenticated X account. You are responsible for protecting your X account, devices, sessions, and any credentials connected with your use of Argos Bot. Instructions authenticated as coming from your account may be treated as authorized by you.
- **Line 12 · Text / template:** Transactions and authorization
- **Line 12 · Text / template:** You are responsible for reviewing every instruction, amount, asset, address, network, pool, range, fee setting, and other transaction detail before submitting it. A request to Argos Bot authorizes the service and its providers to prepare and, where the workflow permits, submit the corresponding blockchain or third-party action from your Argos Bot wallet.
- **Line 12 · Text / template:** Blockchain transactions may be irreversible. Argos Bot cannot guarantee that a transaction will be accepted, execute at an expected price, complete by an estimated time, or be reversible after submission.
- **Line 13 · Text / template:** Tokens and content
- **Line 13 · Text / template:** Tokens and token content are provided by users. Argos Bot does not endorse a token, creator, claim, image, link, or project merely because it appears on the service. Names and tickers may be duplicated, so you should verify the contract address.
- **Line 13 · Text / template:** You must have the rights needed for content you submit and must not provide unlawful, deceptive, infringing, malicious, or abusive content. Argos Bot may restrict or remove content from surfaces it controls.
- **Line 14 · Text / template:** Trading and swaps
- **Line 14 · Text / template:** Trading, swaps, fee claims, and burns involve independent networks, protocols, contracts, pools, and providers. Their rules, fees, availability, and risks also apply.
- **Line 15 · Text / template:** Acceptable use
- **Line 15 · Text / template:** Do not use Argos Bot for unlawful activity, fraud, market manipulation, sanctions evasion, theft, harassment, spam, or infringement.
- **Line 15 · Text / template:** Do not attempt to access another user's wallet, impersonate another person, bypass safeguards or limits, interfere with the service, or exploit errors.
- **Line 15 · Text / template:** Do not submit malicious code, deceptive links, or content that violates another person's rights.
- **Line 15 · Text / template:** Do not use automated traffic in a way that degrades Argos Bot or third-party services.
- **Line 16 · Text / template:** No warranties
- **Line 16 · Text / template:** Argos Bot is provided on an as-is and as-available basis to the fullest extent permitted by law. We disclaim warranties of merchantability, fitness for a particular purpose, title, non-infringement, accuracy, uninterrupted operation, security, and successful transaction execution.
- **Line 17 · Text / template:** Limitation of liability
- **Line 17 · Text / template:** To the fullest extent permitted by law, Argos Bot and its operators will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost assets, profits, data, opportunities, goodwill, or access arising from use of or inability to use the service, blockchain activity, tokens, smart contracts, third-party services, account compromise, or inaccurate information.
- **Line 17 · Text / template:** Nothing in these Terms excludes liability that cannot lawfully be excluded or limited.
- **Line 18 · Text / template:** Your responsibility
- **Line 18 · Text / template:** You are solely responsible for deciding whether and how to use Argos Bot and for the consequences of your instructions. To the extent permitted by law, you agree to defend and indemnify Argos Bot and its operators from claims arising from your unlawful use, submitted content, violation of these Terms, or infringement of another person's rights.
- **Line 19 · Text / template:** Changes and contact
- **Line 19 · Text / template:** We may update these Terms as the service changes. Continued use after an updated version becomes effective constitutes acceptance of the revised Terms.
- **Line 19 · Text / template:** For questions about these Terms, contact Argos Bot support.
- **Line 22 · Accessibility / field text:** Terms of Use

### app/wallet/[address]/not-found.tsx

- **Line 5 · Visible text:** 404
- **Line 5 · Visible text:** Not an Argos Bot Wallet
- **Line 5 · Visible text:** This address is not connected to a wallet created by Argos Bot.
- **Line 5 · Visible text:** Return home

### app/wallet/[address]/page.tsx

- **Line 16 · Visible text:** ARGOS BOT / WALLET
- **Line 16 · Visible text:** Arc wallet
- **Line 16 · Visible text:** View on Arc Explorer ↗

### app/wallet/page.tsx

- **Line 7 · Text / template:** Buy, sell, swap, and send Arc tokens. Track your funds and transactions.
- **Line 8 · Visible text:** Your Wallet.

### app/wallet/sign-in-error/page.tsx

- **Line 6 · Text / template:** Reconnect your X account to access your Argos Bot wallet.
- **Line 11 · Visible text:** Wallet sign-in didn&apos;t finish
- **Line 11 · Visible text:** X could not securely connect this session to an Argos Bot wallet. No wallet action was performed.
- **Line 11 · Visible text:** Try again with X

## Website controls and displays


### components/ArcSendAmountControls.tsx

- **Line 22 · Status / notice:** Balance unavailable
- **Line 32 · Composed display template:** {native?\`Available: ${availableUsdc===null?"—":displayTokenAmount(formatUnits(BigInt(availableUsdc),18),"native")} USDC\`:selected?\`Balance: ${displayTokenAmount(selected.balance,asset)} · ${formatTokenUsd(selected.usdValue)}\`:failed?"Balance unavailable.":"Select a token to load its balance."}
- **Line 32 · Dynamic Text / template:** Available: {availableUsdc===null?"—":displayTokenAmount(formatUnits(BigInt(availableUsdc),18),"native")} USDC
- **Line 32 · Dynamic Text / template:** Balance: {displayTokenAmount(selected.balance,asset)} · {formatTokenUsd(selected.usdValue)}
- **Line 32 · Text / template:** Balance unavailable.
- **Line 32 · Text / template:** Select a token to load its balance.
- **Line 33 · Accessibility / field text:** Send amount unit
- **Line 33 · Composed display template:** {option==="usd"?"$ USD":native?"USDC":"Tokens"}
- **Line 33 · Text / template:** $ USD
- **Line 33 · Text / template:** USDC
- **Line 33 · Text / template:** Tokens
- **Line 34 · Composed display template:** {unit==="usd"?"USD value to send":native?"USDC to send":"Tokens to send"}
- **Line 34 · Text / template:** USD value to send
- **Line 34 · Text / template:** USDC to send
- **Line 34 · Text / template:** Tokens to send
- **Line 35 · Accessibility / field text:** Percentage of available funds to send
- **Line 35 · Composed display template:** {percent}%
- **Line 35 · Visible text:** %
- **Line 36 · Composed display template:** Sending {percentage}% of available {native?"USDC after gas":"tokens, allowing for known token taxes"}. The balance is checked when you send.
- **Line 36 · Visible text:** Sending
- **Line 36 · Visible text:** % of available
- **Line 36 · Text / template:** USDC after gas
- **Line 36 · Text / template:** tokens, allowing for known token taxes
- **Line 36 · Visible text:** . The balance is checked when you send.
- **Line 37 · Visible text:** Token quantity uses a current USDC quote.

### components/ArcTokenBalances.tsx

- **Line 12 · Composed display template:** {token.symbol}
- **Line 12 · Composed display template:** {token.name}
- **Line 12 · Visible text:** ARC
- **Line 13 · Visible text:** Balance
- **Line 13 · Composed display template:** {token.symbol} · {formatTokenUsd(token.usdValue)}
- **Line 13 · Visible text:** ·
- **Line 13 · Dynamic Accessibility / field text:** Explorer price as of {token.pricedAt}
- **Line 14 · Visible text:** Contract address
- **Line 14 · Composed display template:** {copied?"Copied":"Copy CA"}
- **Line 14 · Status / notice:** Could not copy the contract address. Select and copy it below.
- **Line 14 · Dynamic Accessibility / field text:** Copy {token.symbol} contract address
- **Line 14 · Text / template:** Copied
- **Line 14 · Text / template:** Copy CA
- **Line 15 · Visible text:** View on explorer ↗
- **Line 16 · Dynamic Accessibility / field text:** Trade {token.symbol}
- **Line 16 · Dynamic Accessibility / field text:** Buy {token.symbol}
- **Line 16 · Visible text:** Buy
- **Line 16 · Dynamic Accessibility / field text:** Sell {token.symbol}
- **Line 16 · Visible text:** Sell
- **Line 26 · Status / notice:** Token balances unavailable.
- **Line 28 · Status / notice:** Token balances could not refresh.
- **Line 33 · Visible text:** Your Arc tokens
- **Line 34 · Composed display template:** {error} ×
- **Line 34 · Accessibility / field text:** Dismiss token balance notice
- **Line 34 · Visible text:** ×
- **Line 36 · Visible text:** Loading token balances…
- **Line 37 · Visible text:** Some token balances are unavailable. Displayed balances were verified on Arc.
- **Line 38 · Visible text:** No other Arc token balances found.

### components/ArcTokenPicker.tsx

- **Line 9 · Status / notice:** /api/tokens
- **Line 10 · Error:** Token index unavailable
- **Line 20 · Composed display template:** {label}
- **Line 22 · Accessibility / field text:** Ticker, name, or 0x…
- **Line 27 · Composed display template:** {t.address}
- **Line 28 · Text / template:** Loading tokens…
- **Line 28 · Text / template:** Index unavailable. Paste a contract address.
- **Line 28 · Text / template:** No indexed token found. Paste a contract address.
- **Line 30 · Composed display template:** {value?\`Contract: ${value}\`:"Select a token or paste its contract address."}
- **Line 30 · Dynamic Text / template:** Contract: {value}
- **Line 30 · Text / template:** Select a token or paste its contract address.

### components/ArcTradeControls.tsx

- **Line 37 · Status / notice:** Balance unavailable
- **Line 57 · Dynamic Status / notice:** Preparing {side}…
- **Line 59 · Error:** Choose two different token contracts.
- **Line 64 · Status / notice:** Request timed out. The trade may still complete. Check transaction history before submitting again.
- **Line 68 · Text / template:** Buy
- **Line 68 · Text / template:** Sell
- **Line 68 · Text / template:** Swap
- **Line 69 · Accessibility / field text:** From token
- **Line 69 · Accessibility / field text:** Token
- **Line 70 · Composed display template:** {selectedBalance?(side==="buy"?\`${displayTokenAmount(selectedBalance.balance,token)} ${selectedBalance.symbol||"tokens"}${Number.isFinite(selectedBalance.usdValue)&&(selectedBalance.usdValue??0)>0?\` · ${formatTokenUsd(selectedBalance.usdValue)}\`:""}\`:\`Balance: ${displayTokenAmount(selectedBalance.balance,token)} · ${formatTokenUsd(selectedBalance.usdValue)}\`):balanceFailed?"Balance unavailable.":"Loading balance…"}
- **Line 70 · Dynamic Text / template:** {displayTokenAmount(selectedBalance.balance,token)} {selectedBalance.symbol||"tokens"}{Number.isFinite(selectedBalance.usdValue)&&(selectedBalance.usdValue??0)>0?\` · ${formatTokenUsd(selectedBalance.usdValue)}\`:""}
- **Line 70 · Dynamic Text / template:** · {formatTokenUsd(selectedBalance.usdValue)}
- **Line 70 · Dynamic Text / template:** Balance: {displayTokenAmount(selectedBalance.balance,token)} · {formatTokenUsd(selectedBalance.usdValue)}
- **Line 70 · Text / template:** Balance unavailable.
- **Line 70 · Text / template:** Loading balance…
- **Line 71 · Accessibility / field text:** To token
- **Line 72 · Visible text:** Receive Arc USDC.
- **Line 73 · Accessibility / field text:** Trade amount unit
- **Line 73 · Composed display template:** {unit==="tokens"?"Tokens":"$ USD"}
- **Line 73 · Text / template:** Tokens
- **Line 73 · Text / template:** $ USD
- **Line 74 · Composed display template:** {side==="buy"?"USDC to spend":amountUnit==="usd"?(side==="sell"?"USD value to sell":"USD value to swap"):(side==="sell"?"Tokens to sell":"Tokens to swap")}
- **Line 74 · Text / template:** USDC to spend
- **Line 74 · Text / template:** USD value to sell
- **Line 74 · Text / template:** USD value to swap
- **Line 74 · Text / template:** Tokens to sell
- **Line 74 · Text / template:** Tokens to swap
- **Line 74 · Accessibility / field text:** 0.00
- **Line 75 · Accessibility / field text:** Percentage of token balance to trade
- **Line 75 · Composed display template:** {percent}%
- **Line 75 · Visible text:** %
- **Line 76 · Visible text:** Slippage %
- **Line 77 · Composed display template:** {completion.received?<>You received <strong>{completion.received}</strong>.</>:"Trade completed. Received amount unavailable."}
- **Line 77 · Visible text:** You received
- **Line 77 · Visible text:** .
- **Line 77 · Text / template:** Trade completed. Received amount unavailable.
- **Line 77 · Visible text:** View transaction on Arc Explorer
- **Line 77 · Composed display template:** You will receive at least {displayTokenAmount(estimate.minimumOut,estimate.outputAddress??(side==="sell"?"native":side==="buy"?token:output))} {estimate.outputSymbol?estimate.outputSymbol:side==="sell"?"USDC":estimate.outputAddress??(side==="buy"?token:output)}.
- **Line 77 · Visible text:** You will receive at least
- **Line 77 · Text / template:** USDC
- **Line 77 · Visible text:** Estimate includes slippage.
- **Line 77 · Composed display template:** {estimateStatus}
- **Line 78 · Composed display template:** {busy?progress:side==="buy"?"Buy":side==="sell"?"Sell":"Swap"}

### components/CopyWalletAddress.tsx

- **Line 15 · Composed display template:** {address} {copied ? "Copied" : ""}
- **Line 19 · Accessibility / field text:** Wallet address copied
- **Line 19 · Accessibility / field text:** Copy wallet address
- **Line 20 · Accessibility / field text:** Copied
- **Line 27 · Text / template:** Copied

### components/EthUsdValue.tsx

- **Line 9 · Status / notice:** /api/prices/eth
- **Line 11 · Status / notice:** Price unavailable
- **Line 26 · Composed display template:** ({value})
- **Line 26 · Accessibility / field text:** USD estimate at the current ETH price
- **Line 26 · Visible text:** (
- **Line 26 · Visible text:** )

### components/LegalDocument.tsx

- **Line 8 · Visible text:** ← Home
- **Line 9 · Composed display template:** {eyebrow}
- **Line 9 · Composed display template:** {title}
- **Line 9 · Composed display template:** {summary}
- **Line 10 · Composed display template:** {section.title}
- **Line 10 · Composed display template:** {paragraph}

### components/MobileNav.tsx

- **Line 23 · Accessibility / field text:** Argos Bot on X
- **Line 24 · Accessibility / field text:** Argos Bot on Telegram
- **Line 25 · Accessibility / field text:** Close navigation menu
- **Line 25 · Accessibility / field text:** Open navigation menu
- **Line 27 · Visible text:** Home
- **Line 28 · Visible text:** Wallet
- **Line 29 · Visible text:** Guide
- **Line 30 · Visible text:** OTC Market
- **Line 31 · Visible text:** X
- **Line 32 · Visible text:** TG

### components/OpenWalletLink.tsx

- **Line 9 · Visible text:** Open wallet ↗

### components/OtcClient.tsx

- **Line 25 · Text / template:** POST
- **Line 26 · Error:** Request failed.
- **Line 29 · Text / template:** Follow it on your wallet page.
- **Line 29 · Text / template:** view your OTC listings in your wallet
- **Line 40 · Text / template:** ETH
- **Line 43 · Status / notice:** Pending listing could not be read. Check wallet listings before submitting.
- **Line 59 · Status / notice:** Balance unavailable
- **Line 76 · Status / notice:** Market refresh failed. Check listing availability before trading.
- **Line 103 · Dynamic Status / notice:** Purchase confirmed. Received {units(processingPurchase.amount)} Arc USDC. Follow it on your wallet page.
- **Line 107 · Status / notice:** Purchase needs attention. Follow it on your wallet page.
- **Line 119 · Status / notice:** Request failed.
- **Line 123 · Text / template:** Check the amount.
- **Line 127 · Text / template:** Available balance could not load. Try again.
- **Line 127 · Text / template:** Checking available Arc USDC…
- **Line 128 · Dynamic Text / template:** Not enough Arc USDC. You have {usdcUnits(availableWei)} USDC available.
- **Line 132 · Dynamic Text / template:** This listing has {units(selectedListing.available)} USDC available. Enter a smaller amount.
- **Line 143 · Status / notice:** Purchase estimate unavailable.
- **Line 149 · Visible text:** Available Arc USDC
- **Line 149 · Visible text:** Lowest premium
- **Line 149 · Visible text:** Average premium
- **Line 149 · Visible text:** weighted by available USDC
- **Line 150 · Composed display template:** {marketError?"Market refresh failed. Displayed listings may be outdated. Retrying…":""}
- **Line 150 · Text / template:** Market refresh failed. Displayed listings may be outdated. Retrying…
- **Line 152 · Visible text:** Listings
- **Line 152 · Visible text:** Sell USDC
- **Line 157 · Composed display template:** {units(l.available)} USDC
- **Line 157 · Visible text:** USDC
- **Line 158 · Composed display template:** Seller {l.seller.slice(0,6)}…{l.seller.slice(-4)}
- **Line 158 · Visible text:** Seller
- **Line 158 · Visible text:** …
- **Line 159 · Visible text:** Premium
- **Line 159 · Composed display template:** {pct(l.premiumBps)}
- **Line 159 · Visible text:** Service fee
- **Line 159 · Composed display template:** {SERVICE_FEE_BPS/100}%
- **Line 159 · Visible text:** %
- **Line 159 · Visible text:** Premium + fee
- **Line 159 · Composed display template:** +{percent(cost.aboveFaceValue)}
- **Line 159 · Visible text:** +
- **Line 159 · Visible text:** Total cost
- **Line 159 · Composed display template:** {(cost.total/100).toFixed(3)}x face value
- **Line 159 · Visible text:** x face value
- **Line 161 · Composed display template:** {own?"Your listing":"Buy USDC ↗"}
- **Line 161 · Text / template:** Your listing
- **Line 161 · Text / template:** Buy USDC ↗
- **Line 164 · Text / template:** Listings unavailable.
- **Line 164 · Text / template:** Loading listings…
- **Line 164 · Text / template:** No listings.
- **Line 164 · Composed display template:** {!market&&!marketError?"Checking available listings.":market?.available?"Fund your wallet with Arc USDC to list it for sale.":"Unable to load listings. Try again."}
- **Line 164 · Text / template:** Checking available listings.
- **Line 164 · Text / template:** Fund your wallet with Arc USDC to list it for sale.
- **Line 164 · Text / template:** Unable to load listings. Try again.
- **Line 165 · Visible text:** Minimum purchase $10. You can buy part of a listing.
- **Line 169 · Text / template:** New listing
- **Line 169 · Text / template:** Buy from listing
- **Line 169 · Accessibility / field text:** Close form
- **Line 169 · Visible text:** Close ×
- **Line 170 · Composed display template:** {tab==="buy"?\`Base ${paymentAsset} → Arc USDC\`:"List your Arc USDC"}
- **Line 170 · Dynamic Text / template:** Base {paymentAsset} → Arc USDC
- **Line 170 · Text / template:** List your Arc USDC
- **Line 170 · Composed display template:** Available Base ETH {availableWei!=null?<>{units(availableWei,18)} ETH <EthUsdValue wei={availableWei}/></>:balanceFailed?"Balance unavailable":"—"}
- **Line 170 · Visible text:** Available Base ETH
- **Line 170 · Visible text:** ETH
- **Line 170 · Text / template:** Balance unavailable
- **Line 171 · Composed display template:** Available Arc USDC {availableWei!=null?usdcUnits(availableWei):"—"}
- **Line 173 · Visible text:** Connect your account ↗
- **Line 173 · Visible text:** to create a listing or trade. Base actions are website only.
- **Line 174 · Visible text:** Creating OTC USDC listing
- **Line 175 · Status / notice:** Could not save the request for safe retry. No listing was submitted.
- **Line 175 · Status / notice:** Position created. Its escrow deposit is being verified. You can view your OTC listings in your wallet.
- **Line 176 · Composed display template:** Selected listing: {market?.listings.find(l=>l.id===selected)?\`${units(market.listings.find(l=>l.id===selected)!.available)} USDC available · ${pct(market.listings.find(l=>l.id===selected)!.premiumBps)} premium\`:"Listing unavailable"}
- **Line 176 · Visible text:** Selected listing:
- **Line 176 · Dynamic Text / template:** {units(market.listings.find(l=>l.id===selected)!.available)} USDC available · {pct(market.listings.find(l=>l.id===selected)!.premiumBps)} premium
- **Line 176 · Text / template:** Listing unavailable
- **Line 177 · Visible text:** Pay with Base ETH.
- **Line 178 · Composed display template:** {tab==="buy"?"Arc USDC to receive":"Total Arc USDC listing"}USDC{tab==="sell"&&<button type="button" className="otc-inline-button otc-listing-max" disabled={busy||!!pendingListing||availableWei==null} onClick={()=>{if(availableWei==null)return;setAmount(formatUnits(BigInt(availableWei)/10n**12n,6));setListingPreview(null);}}>Max</button>}{tab==="buy"&&<small>Minimum 10 USDC. Base gas is additional.</small>}
- **Line 178 · Text / template:** Arc USDC to receive
- **Line 178 · Text / template:** Total Arc USDC listing
- **Line 178 · Visible text:** Max
- **Line 178 · Visible text:** Minimum 10 USDC. Base gas is additional.
- **Line 180 · Composed display template:** {balanceError}{balanceFailed&&<button type="button" className="otc-inline-button" onClick={()=>setBalanceRevision(value=>value+1)}>Retry</button>}
- **Line 180 · Visible text:** Retry
- **Line 181 · Visible text:** Your premium
- **Line 181 · Visible text:** Set the percent premium for your USDC. The buyer will pay an additional 1.5% service fee on top of this premium.
- **Line 181 · Visible text:** Current lowest
- **Line 181 · Visible text:** Weighted average
- **Line 181 · Visible text:** Your USDC is held in an escrow wallet and listed after funding is verified. Any unsold funds return when you close the position.
- **Line 182 · Visible text:** Listed for sale
- **Line 182 · Visible text:** Sale price at premium
- **Line 182 · Visible text:** $
- **Line 182 · Visible text:** USD
- **Line 182 · Visible text:** Gas
- **Line 182 · Visible text:** Total to reserve
- **Line 183 · Composed display template:** {inputError}
- **Line 184 · Composed display template:** {processingPurchase?"Processing":busy?(tab==="buy"?"Preparing quote…":"Preparing listing…"):tab==="buy"?"Get exact quote":pendingListing?"Retry original listing":listingPreview?"Confirm listing":"Review Listing"}
- **Line 184 · Text / template:** Processing
- **Line 184 · Text / template:** Preparing quote…
- **Line 184 · Text / template:** Preparing listing…
- **Line 184 · Text / template:** Get exact quote
- **Line 184 · Text / template:** Retry original listing
- **Line 184 · Text / template:** Confirm listing
- **Line 184 · Text / template:** Review Listing
- **Line 186 · Visible text:** Your quote
- **Line 186 · Visible text:** s left
- **Line 186 · Visible text:** You receive
- **Line 186 · Composed display template:** {units(quote.amount)} Arc USDC
- **Line 186 · Visible text:** Arc USDC
- **Line 186 · Composed display template:** {pct(quote.premiumBps)}
- **Line 186 · Visible text:** Fee
- **Line 186 · Composed display template:** {(quote.serviceFeeBps??SERVICE_FEE_BPS)/100}%
- **Line 186 · Composed display template:** {units((BigInt(quote.totalWei)+quoteGas(quote)).toString(),18)} ETH
- **Line 186 · Visible text:** Your Base ETH payment goes to an escrow wallet. Once confirmed, you receive the exact Arc USDC quoted.
- **Line 186 · Composed display template:** I understand I’m paying a {pct(quote.premiumBps)} premium.
- **Line 186 · Visible text:** I understand I’m paying a
- **Line 186 · Visible text:** premium.
- **Line 186 · Composed display template:** {busy||processingPurchase?"Processing":"Confirm purchase"}
- **Line 186 · Dynamic Status / notice:** Purchase confirmed. Received {units(result.amount)} Arc USDC. Follow it on your wallet page.
- **Line 186 · Status / notice:** Purchase was not submitted. Request a new quote.
- **Line 186 · Status / notice:** Purchase processing. Follow it on your wallet page.
- **Line 186 · Text / template:** Confirm purchase

### components/PersistentNotices.tsx

- **Line 15 · Visible text:** Reconnect X
- **Line 16 · Accessibility / field text:** Dismiss message
- **Line 16 · Visible text:** ×

### components/PublicWalletBalances.tsx

- **Line 26 · Status / notice:** Wallet balances unavailable.
- **Line 28 · Status / notice:** Wallet balances could not refresh.
- **Line 36 · Visible text:** ARC / USDC
- **Line 36 · Composed display template:** {data?.balanceWei == null ? "—" : displayUsdc(formatUnits(BigInt(data.balanceWei), 18))} USDC
- **Line 36 · Visible text:** USDC
- **Line 36 · Visible text:** Total balance
- **Line 36 · Visible text:** Fund this address with Arc USDC for trading and gas.
- **Line 37 · Visible text:** Sign in with the X account that owns this wallet to use its controls.
- **Line 37 · Visible text:** Open your wallet ↗
- **Line 37 · Visible text:** Sign in with X
- **Line 38 · Visible text:** Balances are public. The owner can buy, sell, swap, and send after signing in.
- **Line 40 · Visible text:** Arc tokens
- **Line 41 · Visible text:** Loading balances…
- **Line 42 · Visible text:** Some balances are unavailable. Displayed balances were verified on Arc.
- **Line 43 · Visible text:** No other Arc token balances found.

### components/SiteChrome.tsx

- **Line 6 · Visible text:** Argos Bot
- **Line 6 · Accessibility / field text:** Main navigation
- **Line 6 · Visible text:** OTC Market
- **Line 6 · Visible text:** Guide
- **Line 6 · Accessibility / field text:** Argos Bot on X
- **Line 6 · Visible text:** X
- **Line 6 · Accessibility / field text:** Argos Bot on Telegram
- **Line 6 · Visible text:** TG
- **Line 7 · Visible text:** Your gateway to Arc Chain.
- **Line 7 · Visible text:** Explore
- **Line 7 · Visible text:** Toolkit
- **Line 7 · Visible text:** Wallet
- **Line 7 · Visible text:** arctos111@proton.me
- **Line 7 · Visible text:** Argos Bot is an independent project and is not affiliated with or endorsed by Arc or Circle.

### components/WalletAccountMenu.tsx

- **Line 8 · Text / template:** DELETE
- **Line 8 · Status / notice:** Sign out was not confirmed. Try again.
- **Line 10 · Visible text:** Wallet ▾
- **Line 10 · Visible text:** @
- **Line 10 · Visible text:** Your wallet
- **Line 10 · Visible text:** Refresh X sign-in
- **Line 10 · Composed display template:** {busy?"Signing out…":"Sign out"}
- **Line 10 · Text / template:** Signing out…
- **Line 10 · Text / template:** Sign out
- **Line 10 · Composed display template:** {error}

### components/WalletControlsPreview.tsx

- **Line 7 · Visible text:** Checking X connection…
- **Line 7 · Visible text:** Connect X to use your wallet ↗
- **Line 7 · Visible text:** View on Arc Explorer ↗
- **Line 8 · Visible text:** ARC / USDC
- **Line 8 · Visible text:** —
- **Line 8 · Visible text:** USDC
- **Line 9 · Visible text:** Move funds
- **Line 9 · Visible text:** Open OTC market ↗
- **Line 10 · Accessibility / field text:** Wallet action
- **Line 10 · Text / template:** Buy
- **Line 10 · Text / template:** Sell
- **Line 10 · Text / template:** Swap
- **Line 10 · Text / template:** Send
- **Line 10 · Composed display template:** {action}
- **Line 12 · Text / template:** Your OTC listings
- **Line 12 · Text / template:** OTC orders
- **Line 12 · Text / template:** Transactions
- **Line 12 · Composed display template:** {title}
- **Line 12 · Visible text:** Connect X to view records.

### components/WalletDashboard.tsx

- **Line 23 · Text / template:** Pending verification
- **Line 46 · Dynamic Status / notice:** {action[0].toUpperCase()+action.slice(1)} completed. See transaction history.
- **Line 56 · Error:** Wallet data unavailable.
- **Line 57 · Error:** Wallet account changed. Refresh the page.
- **Line 62 · Dynamic Status / notice:** {balance.chainId===5042?"Arc":"Base"}: {balance.error}
- **Line 62 · Status / notice:** Arc
- **Line 62 · Status / notice:** Base
- **Line 64 · Status / notice:** Wallet data unavailable. Retry shortly.
- **Line 77 · Composed display template:** {tab==="withdraw"?"Withdraw Base":"Send Arc tokens"}
- **Line 77 · Text / template:** Withdraw Base
- **Line 77 · Text / template:** Send Arc tokens
- **Line 77 · Status / notice:** Preparing withdrawal…
- **Line 77 · Status / notice:** Preparing send…
- **Line 77 · Error:** Send quote expired. Try again.
- **Line 77 · Status / notice:** Preparing send signature…
- **Line 77 · Status / notice:** Request timed out. Check transaction history before submitting again.
- **Line 78 · Composed display template:** {chain===5042?"Arc network · USDC gas":"Base network · ETH gas"}
- **Line 78 · Text / template:** Arc network · USDC gas
- **Line 78 · Text / template:** Base network · ETH gas
- **Line 79 · Visible text:** Asset
- **Line 79 · Visible text:** USDC
- **Line 79 · Visible text:** Arc token
- **Line 80 · Accessibility / field text:** Token
- **Line 81 · Accessibility / field text:** Withdrawal amount unit
- **Line 81 · Composed display template:** {unit==="usd"?"$ USD":"ETH"}
- **Line 81 · Text / template:** $ USD
- **Line 81 · Text / template:** ETH
- **Line 81 · Composed display template:** Amount ({sendUnit==="usd"?"USD":"ETH"}){asset==="native"&&sendUnit==="tokens"&&<EthUsdValue eth={amount}/>}
- **Line 81 · Visible text:** Amount (
- **Line 81 · Text / template:** USD
- **Line 81 · Visible text:** )
- **Line 81 · Visible text:** Recipient
- **Line 81 · Accessibility / field text:** 0x…
- **Line 82 · Composed display template:** {busy?sendProgress:tab==="withdraw"?"Review withdrawal":"Send"}
- **Line 82 · Text / template:** Review withdrawal
- **Line 82 · Text / template:** Send
- **Line 84 · Composed display template:** {tab==="withdraw"?"Confirm Base withdrawal":"Confirm send"}
- **Line 84 · Text / template:** Confirm Base withdrawal
- **Line 84 · Text / template:** Confirm send
- **Line 84 · Composed display template:** {quote.amount} {quote.asset}{chain===8453&&quote.asset==="ETH"&&<EthUsdValue eth={quote.amount}/>}
- **Line 84 · Composed display template:** To {quote.recipient}
- **Line 84 · Visible text:** To
- **Line 84 · Composed display template:** Gas allowance: {units(quote.gasWei,18)} {chain===5042?"USDC":"ETH"}{chain===8453&&<EthUsdValue wei={quote.gasWei}/>}
- **Line 84 · Visible text:** Gas allowance:
- **Line 84 · Text / template:** USDC
- **Line 84 · Composed display template:** {now>=quote.expiresAt?"Quote expired":tab==="withdraw"?"Confirm withdrawal":"Confirm send"}
- **Line 84 · Status / notice:** Preparing withdrawal signature…
- **Line 84 · Text / template:** Quote expired
- **Line 84 · Text / template:** Confirm withdrawal
- **Line 87 · Visible text:** View on Arc Explorer ↗
- **Line 88 · Composed display template:** {id===5042?"ARC / USDC":"BASE / ETH"}
- **Line 88 · Text / template:** ARC / USDC
- **Line 88 · Text / template:** BASE / ETH
- **Line 88 · Composed display template:** {b?.availableWei==null?"—":id===5042?usdcUnits(b.availableWei):units(b.availableWei,18)} {id===5042?"USDC":"ETH"}{id===8453&&<EthUsdValue wei={b?.availableWei}/>}
- **Line 88 · Composed display template:** {id===5042?"USDC":"ETH"}
- **Line 88 · Composed display template:** {b.error} Retry
- **Line 88 · Visible text:** Retry
- **Line 88 · Visible text:** Transaction pending.
- **Line 88 · Visible text:** Close withdrawal ×
- **Line 88 · Visible text:** Withdraw
- **Line 90 · Visible text:** Move funds
- **Line 90 · Visible text:** Open OTC market ↗
- **Line 91 · Accessibility / field text:** Wallet action
- **Line 91 · Composed display template:** {action[0].toUpperCase()+action.slice(1)}
- **Line 94 · Visible text:** Your OTC listings
- **Line 94 · Text / template:** Closing
- **Line 94 · Dynamic Text / template:** {units(l.available)} USDC available
- **Line 94 · Text / template:** Funding escrow
- **Line 94 · Text / template:** Returning funds
- **Line 94 · Text / template:** Cancelled
- **Line 94 · Text / template:** Closed
- **Line 94 · Composed display template:** {(l.premiumBps/100).toLocaleString()}% premium · {units(l.pendingDelivery??l.held)} USDC in pending orders · {l.status==="filled"?"Closed":l.closingAfterSettlement?"Closing":l.status}
- **Line 94 · Visible text:** % premium ·
- **Line 94 · Visible text:** USDC in pending orders ·
- **Line 94 · Composed display template:** {units(l.sold)} Arc USDC sold · Received {units(l.receivedEthWei,18)} Base ETH {BigInt(l.receivedUsdcUnits)>0n&&<> + {units(l.receivedUsdcUnits)} Base USDC</>}
- **Line 94 · Visible text:** Arc USDC sold · Received
- **Line 94 · Visible text:** Base ETH
- **Line 94 · Visible text:** +
- **Line 94 · Visible text:** Base USDC
- **Line 94 · Composed display template:** {settlementNote(l.escrow.note)}
- **Line 94 · Composed display template:** {units(l.returnedUsdc)} Arc USDC returned to available funds.
- **Line 94 · Visible text:** Arc USDC returned to available funds.
- **Line 94 · Status / notice:** Settlement retry failed.
- **Line 94 · Visible text:** Retry settlement
- **Line 94 · Status / notice:** Cancellation failed.
- **Line 94 · Visible text:** Cancel listing
- **Line 94 · Composed display template:** {data?"No listings.":"Listing records unavailable."}
- **Line 94 · Text / template:** No listings.
- **Line 94 · Text / template:** Listing records unavailable.
- **Line 95 · Visible text:** OTC orders
- **Line 95 · Visible text:** Refresh ↻
- **Line 95 · Visible text:** ·
- **Line 95 · Visible text:** Arc USDC
- **Line 95 · Composed display template:** {new Date(order.createdAt).toLocaleString()} · Premium {(order.premiumBps/100).toLocaleString()}% · Payment {units(order.totalWei,order.paymentAsset==="USDC"?6:18)} Base {order.paymentAsset??"ETH"}{order.paymentAsset!=="USDC"&&<EthUsdValue wei={order.totalWei}/>}
- **Line 95 · Visible text:** · Premium
- **Line 95 · Visible text:** % · Payment
- **Line 95 · Visible text:** Base
- **Line 95 · Composed display template:** {settlementNote(order.note)}
- **Line 95 · Status / notice:** Payout retry failed.
- **Line 95 · Visible text:** Retry Arc payout
- **Line 95 · Visible text:** Base payment ↗
- **Line 95 · Visible text:** Arc payout ↗
- **Line 95 · Composed display template:** {order.id}
- **Line 95 · Composed display template:** {data?"No OTC orders.":"Order records unavailable."}
- **Line 95 · Text / template:** No OTC orders.
- **Line 95 · Text / template:** Order records unavailable.
- **Line 96 · Visible text:** Transactions
- **Line 96 · Text / template:** Base Payout Received
- **Line 96 · Text / template:** Arc
- **Line 96 · Text / template:** Base
- **Line 96 · Composed display template:** {tx.status.replaceAll("_"," ")} · {new Date(tx.createdAt).toLocaleString()}
- **Line 96 · Status / notice:** _
- **Line 96 · Composed display template:** {detail.label}
- **Line 96 · Composed display template:** {detail.value}{tx.chainId===8453&&/^\d+(?:\.\d+)? ETH$/.test(detail.value)&&<EthUsdValue eth={detail.value.slice(0,-4)}/>}
- **Line 96 · Visible text:** Block
- **Line 96 · Composed display template:** {tx.blockNumber}
- **Line 96 · Composed display template:** {settlementNote(tx.note)}
- **Line 96 · Visible text:** View transaction ↗
- **Line 96 · Composed display template:** {data?"No transactions.":"Transaction records unavailable."}
- **Line 96 · Text / template:** No transactions.
- **Line 96 · Text / template:** Transaction records unavailable.

### components/WalletSessionProvider.tsx

- **Line 20 · Error:** Session check unavailable

### components/WalletXName.tsx

- **Line 6 · Composed display template:** {session?.authenticated&&session.username?\`@${session.username.replace(/^@/,"")}\`:""}

## Website API responses


### app/api/arc/command/route.ts

- **Line 23 · Text / template:** Unsupported Argus pool configuration.
- **Line 24 · Text / template:** Unexpected Argus token record length.
- **Line 25 · Text / template:** Unexpected Argus Portal format.
- **Line 26 · Text / template:** Argus token contract code missing.
- **Line 27 · Text / template:** Argus hook identity mismatch.
- **Line 28 · Text / template:** Argus launch quote asset mismatch.
- **Line 29 · Text / template:** Argus pool ID mismatch.
- **Line 30 · Text / template:** Arc router code does not match the reviewed deployment.
- **Line 31 · Text / template:** Hook execution requires a reviewed adapter
- **Line 32 · Text / template:** Mixed routes require two or three pools and ERC-20 currencies
- **Line 33 · Text / template:** Minimum output rounds to zero
- **Line 34 · Text / template:** Invalid output or slippage (maximum 10%)
- **Line 35 · Text / template:** V4 amount exceeds uint128
- **Line 42 · Error:** Use the Arc token contract address.
- **Line 46 · Text / template:** Input
- **Line 46 · Text / template:** Received
- **Line 46 · Text / template:** Amount
- **Line 46 · Text / template:** To
- **Line 46 · Text / template:** Burn destination
- **Line 46 · Text / template:** Gas paid
- **Line 46 · Text / template:** Route
- **Line 47 · Text / template:** Base withdrawal
- **Line 47 · Text / template:** Buy and burn
- **Line 47 · Text / template:** Buy and send
- **Line 47 · Text / template:** Swap
- **Line 48 · Text / template:** confirmed.
- **Line 52 · Dynamic Text / template:** Bearer {secret}
- **Line 52 · Text / template:** Unauthorized.
- **Line 60 · Status / notice:** Command not supported.
- **Line 68 · Status / notice:** Command not supported. Stored transaction chain mismatch.
- **Line 70 · Text / template:** Trade expired before signing. Funds released. Submit a new command.
- **Line 71 · Text / template:** Arc transaction reverted. Check wallet history.
- **Line 72 · Text / template:** Arc transaction pending. Check wallet history.
- **Line 77 · Error:** Request expired before the next transaction was prepared. Check wallet history before sending a new command.
- **Line 83 · Error:** Specify the USDC amount to spend, for example buy 10 USDC of TOKEN or buy $10 of TOKEN.
- **Line 84 · Error:** Specify a USDC value, token amount, or percentage to sell.
- **Line 85 · Error:** Specify a token amount, USDC value, or percentage to swap.
- **Line 89 · Error:** Use a valid recipient wallet.
- **Line 93 · Error:** Use /withdraw to send Base ETH.
- **Line 93 · Error:** Use Telegram or the website to withdraw Base ETH.
- **Line 95 · Error:** Command not supported. Use buy, sell, send, or burn with explicit amounts.
- **Line 100 · Text / template:** Arc request recorded. Funds remain reserved for verification.
- **Line 104 · Text / template:** Arc request recorded. Check wallet history.
- **Line 106 · Text / template:** Approval steps exceeded the request limit. Check wallet history.
- **Line 108 · Text / template:** Arc command failed.
- **Line 111 · Text / template:** Wallet authorization changed. Reconnect before sending a new command.
- **Line 113 · Text / template:** Arc request is waiting for verification.

### app/api/auth/x/callback/route.ts

- **Line 31 · Status / notice:** configuration
- **Line 37 · Status / notice:** invalid_state
- **Line 40 · Dynamic Text / template:** {siteUrl.replace(/\/$/, "")}/api/auth/x/callback
- **Line 42 · Text / template:** POST
- **Line 44 · Dynamic Text / template:** Basic {Buffer.from(\`${clientId}:${clientSecret}\`).toString("base64")}
- **Line 56 · Status / notice:** token_exchange
- **Line 61 · Dynamic Text / template:** Bearer {token.access_token}
- **Line 65 · Status / notice:** identity
- **Line 97 · Status / notice:** session
- **Line 116 · Status / notice:** wallet

### app/api/auth/x/session/route.ts

- **Line 28 · Text / template:** Invalid request origin
- **Line 34 · Text / template:** Invalid session token
- **Line 35 · Text / template:** Sign out could not be completed

### app/api/auth/x/start/route.ts

- **Line 20 · Text / template:** X wallet sign-in is not configured
- **Line 46 · Dynamic Text / template:** {siteUrl.replace(/\/$/, "")}/api/auth/x/callback
- **Line 52 · Text / template:** users.read tweet.read

### app/api/auth/x/telegram-confirm/route.ts

- **Line 11 · Text / template:** text/plain; charset=utf-8
- **Line 21 · Text / template:** Link expired. Start again from Telegram.
- **Line 24 · Text / template:** Unable to check the link right now. Reload this page to retry. No wallet access was granted by this page.
- **Line 25 · Text / template:** This link expired or was already used. Return to Telegram to check your link or start again.
- **Line 28 · Text / template:** Link could not be checked. Start again in Telegram.
- **Line 37 · Text / template:** Unauthorized
- **Line 39 · Text / template:** Invalid confirmation. Reload this page and try again.
- **Line 49 · Text / template:** We couldn't verify the linking result. Check Telegram first. If it isn't linked, reload this page or start linking again from Telegram.
- **Line 51 · Text / template:** Invalid choice

### app/api/csp-report/route.ts

- **Line 32 · Text / template:** Invalid CSP report

### app/api/market/activity/route.ts

- **Line 5 · Text / template:** This endpoint is retired. Use the Argos Bot wallet.

### app/api/market/gecko-trades/route.ts

- **Line 5 · Text / template:** This endpoint is retired. Use the Argos Bot wallet.

### app/api/market/holders/route.ts

- **Line 5 · Text / template:** This endpoint is retired. Use the Argos Bot wallet.

### app/api/market/snapshot/route.ts

- **Line 5 · Text / template:** This endpoint is retired. Use the Argos Bot wallet.

### app/api/otc/route.ts

- **Line 28 · Text / template:** ETH
- **Line 47 · Dynamic Text / template:** {chain===5042?"Arc":"Base"} balance unavailable. Retry shortly.
- **Line 47 · Text / template:** Arc
- **Line 47 · Text / template:** Base
- **Line 80 · Error:** Order not found.
- **Line 82 · Error:** Gas exceeded the original payout allowance. Retry when fees fall.
- **Line 98 · Error:** Gas changed. Review the listing again.
- **Line 100 · Error:** Wallet has a pending transaction.
- **Line 108 · Error:** Listing not found.
- **Line 110 · Error:** This listing no longer has that much USDC available. Enter a smaller amount.
- **Line 112 · Error:** Listing escrow configuration changed.
- **Line 121 · Error:** OTC settlement requires standard EVM wallets.
- **Line 126 · Error:** Not enough available Base ETH for the amount, premium, 1.5% fee, and gas.
- **Line 134 · Error:** Payment options changed. Request a new ETH quote.
- **Line 135 · Error:** Quote configuration changed. Request a new quote.
- **Line 140 · Text / template:** Escrow settlement is waiting for verification. Funds remain held.
- **Line 144 · Error:** Wallet has a pending transaction or insufficient gas reserve.
- **Line 148 · Text / template:** Order accepted. Settlement is waiting for verification. Funds remain reserved.

### app/api/otc/worker/route.ts

- **Line 9 · Dynamic Text / template:** Bearer {secret}
- **Line 9 · Text / template:** Unauthorized.
- **Line 10 · Text / template:** Settlement worker unavailable.

### app/api/prices/eth/route.ts

- **Line 14 · Text / template:** public, max-age=30, s-maxage=30
- **Line 16 · Text / template:** ETH/USD estimate unavailable.

### app/api/terminal/route.ts

- **Line 5 · Text / template:** This endpoint is retired. Use the Argos Bot wallet.

### app/api/token-image/route.ts

- **Line 35 · Error:** image URL is too long
- **Line 37 · Error:** image URL is not allowed
- **Line 39 · Error:** image host is not allowed
- **Line 41 · Error:** image host is not public
- **Line 62 · Status / notice:** image response is not allowed
- **Line 66 · Status / notice:** image is too large
- **Line 70 · Status / notice:** image response interrupted
- **Line 82 · Status / notice:** too many image redirects
- **Line 86 · Status / notice:** image request failed
- **Line 94 · Text / template:** Image URL is required
- **Line 99 · Text / template:** public, max-age=86400, stale-while-revalidate=604800
- **Line 103 · Text / template:** public, max-age=300

### app/api/tokens/route.ts

- **Line 17 · Text / template:** public, max-age=60, stale-while-revalidate=300

### app/api/wallet-signer/[...path]/route.ts

- **Line 34 · Dynamic Status / notice:** {issue.path.join(".") || "request"}: {issue.message}
- **Line 34 · Status / notice:** request
- **Line 34 · Status / notice:** ;
- **Line 38 · Text / template:** invalid signer request
- **Line 64 · Text / template:** quote returned no output
- **Line 67 · Text / template:** wallet signer request failed
- **Line 75 · Text / template:** Operation not supported.
- **Line 206 · Error:** manual vault broadcast requires its allowlisted token address
- **Line 259 · Error:** wallet reference mismatch
- **Line 261 · Error:** wallet owner mismatch
- **Line 324 · Text / template:** not found
- **Line 327 · Status / notice:** /

### app/api/wallet/public/[address]/route.ts

- **Line 13 · Text / template:** Invalid wallet address.
- **Line 21 · Text / template:** public, max-age=15, s-maxage=15

### app/api/wallet/send/route.ts

- **Line 28 · Error:** Use a different, nonzero recipient.
- **Line 35 · Error:** Base withdrawals support ETH only.
- **Line 36 · Error:** Enter an amount for Base withdrawals.
- **Line 40 · Text / template:** ETH
- **Line 43 · Error:** Invalid send quote.
- **Line 45 · Error:** Quote owner mismatch.
- **Line 48 · Error:** Quote expired. Check the amount again.
- **Line 51 · Error:** Base withdrawals support ETH only. Request a new quote.
- **Line 52 · Error:** Wallet nonce changed. Request a new quote.

### app/api/wallet/tokens/route.ts

- **Line 15 · Error:** Choose a valid token contract.

### app/api/wallet/trade/route.ts

- **Line 33 · Error:** Not enough available funds or a wallet transaction is pending.
- **Line 39 · Error:** Invalid trade quote.
- **Line 41 · Error:** Quote owner mismatch.
- **Line 44 · Error:** Quote expired. Review the trade again.
- **Line 46 · Error:** Wallet nonce changed. Review the trade again.

### app/api/wallet/transaction/route.ts

- **Line 13 · Error:** Invalid transaction ID.
- **Line 15 · Error:** Transaction not found.

## Supporting messages (may be translated or masked)


### convex/otc.ts

- **Line 12 · Error:** OTC service authorization failed.
- **Line 23 · Error:** OTC request too large.
- **Line 50 · Error:** Escrow listing configuration missing.
- **Line 55 · Status / notice:** by_owner
- **Line 55 · Status / notice:** quoted
- **Line 59 · Error:** You already have a quote. Confirm it or wait for it to expire.
- **Line 68 · Error:** Order missing.
- **Line 82 · Error:** Record missing.
- **Line 85 · Error:** Unknown OTC command.
- **Line 107 · Status / notice:** otcRecords
- **Line 107 · Status / notice:** by_kind_status
- **Line 107 · Status / notice:** status
- **Line 107 · Status / notice:** asc
- **Line 112 · Status / notice:** active
- **Line 128 · Error:** OTC worker URL is not configured.
- **Line 129 · Text / template:** POST
- **Line 129 · Dynamic Text / template:** Bearer {args.secret}
- **Line 130 · Error:** OTC settlement worker failed.
- **Line 139 · Error:** Wallet worker configuration missing.
- **Line 140 · Dynamic Text / template:** Bearer {secret}
- **Line 141 · Error:** OTC worker failed. Inspect pending jobs and worker logs.
- **Line 143 · Dynamic Error:** OTC worker: {result.failed} failed jobs; {result.processed} processed.

### lib/address-display.ts

- **Line 3 · Dynamic Text / template:** {address.slice(0, 6)}…{address.slice(-4)}

### lib/arc/amounts.ts

- **Line 6 · Error:** Invalid token decimals
- **Line 7 · Error:** Use a positive decimal amount without exponents or separators
- **Line 9 · Error:** Amount exceeds token precision
- **Line 11 · Error:** Amount outside uint256 range
- **Line 16 · Error:** Invalid native balance
- **Line 21 · Error:** Invalid gas reservation
- **Line 23 · Error:** Insufficient USDC for transfer and gas reserve

### lib/arc/argus-discovery.ts

- **Line 14 · Text / template:** function LAUNCH_STRUCT_WORDS() view returns(uint8)
- **Line 15 · Text / template:** function launches(address) view returns(address,int24,bool,address,address,address,uint16,uint16,uint256,int24)
- **Line 16 · Text / template:** function poolId() view returns(bytes32)
- **Line 16 · Text / template:** function token() view returns(address)
- **Line 17 · Text / template:** function portal() view returns(address)
- **Line 17 · Text / template:** function splitter() view returns(address)
- **Line 18 · Text / template:** function poolManager() view returns(address)
- **Line 18 · Text / template:** function quoteAsset() view returns(address)
- **Line 19 · Text / template:** function poolFee() view returns(uint24)
- **Line 19 · Text / template:** function tickSpacing() view returns(int24)
- **Line 21 · Text / template:** function launches(address) view returns(address,int24,bool,address,address,address,uint16,uint16,uint256,int24,address)
- **Line 22 · Text / template:** function launches(address) view returns(address,int24,bool,address,address,address,uint16,uint16,uint256)
- **Line 30 · Error:** Unexpected Argus token record length.
- **Line 33 · Error:** Unexpected Argus Portal format.
- **Line 35 · Error:** Argus token contract code missing.
- **Line 37 · Error:** Argus hook identity mismatch.
- **Line 38 · Error:** Argus launch quote asset mismatch.
- **Line 40 · Error:** Unsupported Argus pool configuration.
- **Line 43 · Error:** Argus pool ID mismatch.

### lib/arc/config.ts

- **Line 11 · Text / template:** Arc RPC must be an explicit HTTPS endpoint without embedded user credentials
- **Line 25 · Error:** Gas limits must be positive
- **Line 33 · Error:** Configure ARC_MAINNET_RPC_URL, ARC_CHECKPOINT_NUMBER and ARC_CHECKPOINT_HASH before preparing Arc transactions
- **Line 44 · Text / template:** Arc Mainnet
- **Line 45 · Text / template:** USDC

### lib/arc/discovery.ts

- **Line 20 · Error:** Arc explorer unavailable
- **Line 23 · Error:** Arc explorer market index is stale
- **Line 36 · Error:** Explorer returned conflicting pool identities

### lib/arc/estimate-refresh.ts

- **Line 2 · Text / template:** Estimate expired. Change the amount to refresh.
- **Line 24 · Status / notice:** Estimates paused. Change the amount to refresh.
- **Line 30 · Status / notice:** Estimating…
- **Line 35 · Status / notice:** Invalid estimate expiry
- **Line 52 · Status / notice:** Estimate unavailable. Change the amount to retry.

### lib/arc/quotes.ts

- **Line 11 · Text / template:** function getPool(address,address,uint24) view returns (address)
- **Line 12 · Text / template:** function liquidity() view returns (uint128)
- **Line 13 · Text / template:** function getLiquidity(bytes32) view returns (uint128)
- **Line 14 · Text / template:** function getSlot0(bytes32) view returns (uint160,int24,uint24,uint24)
- **Line 15 · Text / template:** function quoteExactInput(bytes,uint256) returns (uint256,uint160[],uint32[],uint256)
- **Line 16 · Text / template:** function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)
- **Line 18 · Text / template:** function quoteExactInput((address exactCurrency,(address intermediateCurrency,uint24 fee,int24 tickSpacing,address hooks,bytes hookData)[] path,uint128 exactAmount) params) returns(uint256 amountOut,uint256 gasEstimate)
- **Line 24 · Error:** Provide 1–32 route candidates
- **Line 25 · Error:** Invalid input amount
- **Line 31 · Error:** Arc quote head is stale or invalid
- **Line 46 · Error:** Contract code missing
- **Line 52 · Status / notice:** Mixed routes require ERC-20 currencies
- **Line 56 · Status / notice:** No intermediate output
- **Line 65 · Error:** Invalid V3 route
- **Line 67 · Error:** V3 factory pool mismatch
- **Line 69 · Error:** No active liquidity
- **Line 74 · Error:** V4 input exceeds uint128
- **Line 77 · Error:** Invalid V4 route
- **Line 80 · Error:** V4 pool is uninitialized or has no active liquidity
- **Line 95 · Text / template:** Hook requires a reviewed adapter and sender-specific simulation
- **Line 100 · Text / template:** Mixed-protocol quotes are unsupported
- **Line 100 · Text / template:** V3 factory pool mismatch
- **Line 100 · Text / template:** No active liquidity
- **Line 100 · Text / template:** V4 multihop quotes are unsupported
- **Line 100 · Text / template:** V4 input exceeds uint128
- **Line 100 · Text / template:** V4 pool is uninitialized or has no active liquidity
- **Line 100 · Text / template:** Contract code missing
- **Line 101 · Text / template:** Route validation or quote failed
- **Line 108 · Error:** Quote snapshot changed
- **Line 110 · Error:** Quote candidates must share input and output currencies

### lib/arc/route-hint.ts

- **Line 15 · Dynamic Text / template:** {payload}.{mac(payload, secret).toString("base64url")}

### lib/arc/routing.ts

- **Line 6 · Text / template:** address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks
- **Line 7 · Text / template:** ((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,uint256 minHopPriceX36,bytes hookData)
- **Line 8 · Text / template:** (address currencyIn,(address intermediateCurrency,uint24 fee,int24 tickSpacing,address hooks,bytes hookData)[] path,uint256[] minHopPriceX36,uint128 amountIn,uint128 amountOutMinimum)
- **Line 9 · Text / template:** function execute(bytes commands, bytes[] inputs, uint256 deadline) payable
- **Line 23 · Error:** Pool currencies must be sorted and distinct
- **Line 24 · Error:** Unsupported pool fee
- **Line 26 · Error:** V3 requires ERC-20 currencies and a pool address
- **Line 30 · Error:** Invalid tick spacing
- **Line 36 · Error:** Route must have one to three hops between distinct currencies
- **Line 42 · Error:** Repeated pool
- **Line 46 · Error:** Disconnected or cyclic route
- **Line 49 · Error:** Wrong route output
- **Line 55 · Error:** Too many pool candidates
- **Line 86 · Error:** V3 path requires V3 pools
- **Line 88 · Dynamic Text / template:** {path}{encodePacked(["uint24", "address"], [pool.fee, currencies[i + 1]]).slice(2)}
- **Line 95 · Error:** V4 path requires V4 pools
- **Line 101 · Error:** Invalid output or slippage (maximum 10%)
- **Line 103 · Error:** Minimum output rounds to zero
- **Line 111 · Error:** Use a valid recipient wallet.
- **Line 113 · Error:** Swap limits must be positive
- **Line 123 · Error:** V4 amount exceeds uint128
- **Line 124 · Error:** Hook execution requires a reviewed adapter
- **Line 148 · Status / notice:** Mixed routes require two or three pools and ERC-20 currencies
- **Line 149 · Status / notice:** V4 amount exceeds uint128
- **Line 151 · Status / notice:** Hook execution requires a reviewed adapter
- **Line 181 · Status / notice:** Invalid swap router
- **Line 187 · Status / notice:** Invalid token balance guard

### lib/arc/rpc.ts

- **Line 22 · Text / template:** function decimals() view returns (uint8)
- **Line 22 · Text / template:** function balanceOf(address) view returns (uint256)
- **Line 31 · Error:** RPC returned an unmined block
- **Line 57 · Error:** RPC is not Arc mainnet (5042)
- **Line 59 · Error:** Arc checkpoint mismatch
- **Line 62 · Error:** Arc RPC head is stale or invalid

### lib/arc/social-authority.ts

- **Line 5 · Error:** Social wallet authorization is not configured.

### lib/arc/social-balance.ts

- **Line 18 · Status / notice:** Use the Arc token contract address in the balance command.
- **Line 23 · Dynamic Text / template:** {displayAmount(amount, 0)} {balance.symbol}
- **Line 27 · Status / notice:** Arc balance block changed. Retry the balance command.
- **Line 29 · Dynamic Text / template:** {displayUsdc(usdcAmount)} USDC
- **Line 30 · Text / template:** USDC
- **Line 37 · Dynamic Text / template:** {formatUnits(BigInt(snapshot.balanceWei),18)} Base ETH{usd?\` (${usd})\`:""}
- **Line 37 · Dynamic Text / template:** ({usd})
- **Line 38 · Text / template:** Base balance unavailable.
- **Line 40 · Dynamic Text / template:** {balanceWithUsd(\`${displayAmount(t.balance, 0)} ${t.symbol}\`, t.usdValue ?? undefined)} {t.address}
- **Line 40 · Dynamic Text / template:** {displayAmount(t.balance, 0)} {t.symbol}
- **Line 40 · Text / template:** Some token balances are unavailable. Check the balance using a contract address.

### lib/arc/social-timing.ts

- **Line 5 · Text / template:** wallet confirmation is pending
- **Line 16 · Text / template:** Arc request is waiting for verification.

### lib/arc/token-catalog.ts

- **Line 12 · Text / template:** NFKC

### lib/arc/token-info.ts

- **Line 5 · Text / template:** function symbol() view returns (string)
- **Line 5 · Text / template:** function name() view returns (string)
- **Line 5 · Text / template:** function totalSupply() view returns (uint256)
- **Line 16 · Status / notice:** Arc token block changed
- **Line 17 · Dynamic Text / template:** {formatUnits(raw, decimals)} {symbol}

### lib/arc/token-value.ts

- **Line 4 · Text / template:** USD estimate unavailable
- **Line 5 · Dynamic Text / template:** {formatBalanceUsd(value)} USD

### lib/arc/trade-flow.ts

- **Line 11 · Error:** Invalid trade amount.
- **Line 27 · Error:** Trade paused. Check transaction history before continuing.
- **Line 28 · Error:** Quote expired. Submit the trade again.
- **Line 33 · Text / template:** Gas exceeded the trade allowance. No swap was submitted. Submit again for a fresh gas estimate.
- **Line 35 · Text / template:** Price moved below the original minimum. No swap was submitted. Submit again for a fresh quote.
- **Line 36 · Status / notice:** Preparing trade…
- **Line 36 · Status / notice:** Preparing approval reset…
- **Line 36 · Status / notice:** Preparing router approval…
- **Line 36 · Status / notice:** Preparing token approval…
- **Line 38 · Error:** Unexpected transaction. Check transaction history.
- **Line 39 · Error:** Transaction reverted. Check transaction history.
- **Line 40 · Text / template:** approval reset
- **Line 40 · Text / template:** router approval
- **Line 40 · Text / template:** token approval
- **Line 45 · Status / notice:** Refreshing trade quote…
- **Line 48 · Text / template:** Trade setup changed. Check transaction history before submitting again.

### lib/arc/trade-result.ts

- **Line 5 · Error:** Trade is not completed.
- **Line 8 · Dynamic Text / template:** {side[0].toUpperCase()+side.slice(1)} completed.
- **Line 9 · Text / template:** Input
- **Line 9 · Text / template:** Received
- **Line 9 · Text / template:** Gas paid
- **Line 9 · Text / template:** Route
- **Line 11 · Dynamic Text / template:** {label}: {value}.
- **Line 13 · Text / template:** Received amount unavailable.
- **Line 14 · Dynamic Text / template:** Transaction: {result.hash}

### lib/arc/trading.ts

- **Line 17 · Text / template:** function allowance(address,address) view returns (uint256)
- **Line 17 · Text / template:** function approve(address,uint256) returns (bool)
- **Line 18 · Text / template:** function allowance(address,address,address) view returns (uint160,uint48,uint48)
- **Line 18 · Text / template:** function approve(address,address,uint160,uint48)
- **Line 32 · Error:** Arc router code does not match the reviewed deployment.
- **Line 33 · Error:** Choose different assets.
- **Line 61 · Error:** Discovery block changed.
- **Line 124 · Error:** No supported liquid Arc route found.
- **Line 141 · Text / template:** USDC
- **Line 141 · Text / template:** function symbol() view returns (string)
- **Line 142 · Error:** Quote expired. Try again.
- **Line 155 · Error:** Not enough tokens.
- **Line 161 · Error:** Use a larger sell amount.
- **Line 163 · Error:** Not enough tokens for that USDC value.
- **Line 169 · Error:** Use a valid recipient wallet.
- **Line 170 · Error:** Buy and burn requires USDC input and a different token output.
- **Line 174 · Error:** Not enough tokens for the amount plus token tax. Use a smaller amount or 100%.
- **Line 178 · Error:** Amount exceeds Permit2 limits.
- **Line 185 · Text / template:** reset token approval
- **Line 185 · Text / template:** approve token
- **Line 188 · Text / template:** approve router
- **Line 203 · Status / notice:** Swap balance snapshot changed.

### lib/arc/transaction-progress.ts

- **Line 4 · Dynamic Text / template:** Preparing {action} signature…
- **Line 5 · Dynamic Text / template:** Submitting {action}…
- **Line 6 · Dynamic Text / template:** Confirming {action}…
- **Line 7 · Dynamic Text / template:** {action[0].toUpperCase()+action.slice(1)} completed.
- **Line 8 · Text / template:** Trade expired before signing. Funds released. Submit again.
- **Line 9 · Dynamic Text / template:** {action[0].toUpperCase()+action.slice(1)} reverted. Check transaction history.
- **Line 10 · Error:** Transaction status unavailable. Check transaction history before submitting again.
- **Line 15 · Error:** Status could not refresh. Check transaction history before submitting again.
- **Line 21 · Error:** Tracking stopped. Check transaction history before submitting again.
- **Line 22 · Error:** Unexpected transaction status. Check transaction history.
- **Line 24 · Dynamic Status / notice:** {action[0].toUpperCase()+action.slice(1)} received on Base. Verifying delivery…
- **Line 24 · Dynamic Status / notice:** {action[0].toUpperCase()+action.slice(1)} reverted on Base. Verifying receipt…
- **Line 31 · Dynamic Status / notice:** Reconnecting to check {action} confirmation…

### lib/arc/transfer-tax.ts

- **Line 7 · Text / template:** function currentTaxes() view returns(uint16,uint16)
- **Line 7 · Text / template:** function isExempt(address) view returns(bool)
- **Line 10 · Error:** Invalid token tax or balance.
- **Line 25 · Error:** Invalid on-chain token tax.

### lib/arc/transport.ts

- **Line 33 · Text / template:** POST
- **Line 35 · Error:** Arc RPC connection unavailable
- **Line 36 · Dynamic Error:** Arc RPC HTTP {response.status}
- **Line 38 · Error:** Invalid Arc RPC response
- **Line 41 · Error:** Invalid Arc RPC error
- **Line 42 · Text / template:** RPC error
- **Line 45 · Error:** Arc RPC capacity or method unavailable
- **Line 45 · Error:** Arc RPC rejected request
- **Line 47 · Error:** Missing Arc RPC result
- **Line 52 · Error:** Arc RPC chain mismatch
- **Line 54 · Error:** Arc RPC checkpoint mismatch
- **Line 57 · Error:** Arc RPC head is stale
- **Line 61 · Error:** Arc RPC cooling down
- **Line 75 · Error:** Arc RPC method not authorized
- **Line 93 · Error:** No healthy Arc RPC supports this request

### lib/arc/usdc-delivery.ts

- **Line 9 · Error:** Invalid Arc gas evidence.
- **Line 13 · Text / template:** Transfer
- **Line 19 · Error:** Arc USDC transfer evidence does not match.

### lib/arc/wallet-actions.ts

- **Line 11 · Text / template:** function decimals() view returns (uint8)
- **Line 11 · Text / template:** function balanceOf(address) view returns (uint256)
- **Line 11 · Text / template:** function transfer(address,uint256) returns (bool)
- **Line 18 · Error:** Use a percentage up to 100.
- **Line 28 · Error:** Wallet has a pending transaction.
- **Line 30 · Error:** Not enough available funds. OTC listings and gas are reserved.
- **Line 36 · Error:** Use a different, nonzero recipient.
- **Line 37 · Error:** Choose a percentage or a USD value.
- **Line 46 · Error:** Not enough available USDC after gas.
- **Line 54 · Error:** Token precision is not supported.
- **Line 56 · Error:** Not enough tokens.
- **Line 60 · Text / template:** USDC

### lib/arc/wallet-balance.ts

- **Line 19 · Error:** Balance block changed

### lib/arc/wallet-tokens.ts

- **Line 12 · Text / template:** function symbol() view returns (string)
- **Line 12 · Text / template:** function name() view returns (string)
- **Line 22 · Status / notice:** Token balance block changed
- **Line 41 · Status / notice:** Token discovery unavailable
- **Line 42 · Status / notice:** Invalid token discovery

### lib/automated-fee-scheduling.ts

- **Line 32 · Error:** invalid fee accounting

### lib/balance-display.ts

- **Line 11 · Dynamic Text / template:** {display} ({usd})

### lib/base/config.ts

- **Line 11 · Text / template:** Base RPC must be an explicit HTTPS endpoint without embedded user credentials
- **Line 25 · Error:** Gas limits must be positive
- **Line 33 · Error:** Configure BASE_MAINNET_RPC_URL, BASE_CHECKPOINT_NUMBER and BASE_CHECKPOINT_HASH before preparing Base transactions

### lib/base/rpc.ts

- **Line 23 · Text / template:** function getL1FeeUpperBound(uint256) view returns (uint256)
- **Line 23 · Text / template:** function getOperatorFee(uint256) view returns (uint256)
- **Line 27 · Error:** Unmined Base block
- **Line 60 · Error:** RPC is not Base mainnet (8453)
- **Line 62 · Error:** Base checkpoint mismatch
- **Line 65 · Error:** Base RPC head is stale or invalid
- **Line 72 · Error:** Base receipt left the canonical chain
- **Line 78 · Error:** Settlement block mismatch
- **Line 82 · Error:** Base receipt changed during finality check

### lib/base/transfers.ts

- **Line 7 · Text / template:** Use a nonzero checksummed address
- **Line 11 · Text / template:** Recipient must differ from sender
- **Line 38 · Error:** Base gas exceeds policy
- **Line 41 · Error:** Wallet has pending transactions; reconcile before sending
- **Line 44 · Error:** Invalid Base fee estimate
- **Line 47 · Error:** Base total fee reserve exceeds policy
- **Line 48 · Error:** Insufficient ETH including L1 and L2 fees
- **Line 49 · Error:** Base preparation snapshot changed

### lib/base/transport.ts

- **Line 14 · Dynamic Text / template:** {item.details??""} {item.message??""}
- **Line 53 · Error:** Base RPC identity or head check failed.
- **Line 59 · Text / template:** No healthy Base RPC is available.
- **Line 67 · Error:** Base RPC block is unavailable.

### lib/base/usdc.ts

- **Line 6 · Text / template:** function balanceOf(address) view returns (uint256)
- **Line 7 · Text / template:** function allowance(address,address) view returns (uint256)
- **Line 8 · Text / template:** function approve(address,uint256) returns (bool)
- **Line 9 · Text / template:** event Approval(address indexed owner,address indexed spender,uint256 value)
- **Line 10 · Text / template:** event Transfer(address indexed from,address indexed to,uint256 value)

### lib/base/wallet-actions.ts

- **Line 11 · Error:** Use a different, nonzero recipient.
- **Line 15 · Error:** ETH price unavailable. Try again.
- **Line 19 · Error:** Use a positive ETH amount.
- **Line 22 · Error:** Wallet has a pending transaction.
- **Line 23 · Error:** Not enough available funds. OTC listings and gas are reserved.
- **Line 24 · Text / template:** ETH

### lib/bounded-json.ts

- **Line 8 · Error:** request too large
- **Line 10 · Error:** request body is required
- **Line 28 · Error:** invalid JSON request

### lib/brand.ts

- **Line 4 · Text / template:** Argos Bot
- **Line 5 · Text / template:** Argus

### lib/coingecko-client.ts

- **Line 20 · Error:** invalid CoinGecko URL

### lib/creator-burn-policy.ts

- **Line 12 · Error:** Use a percentage from 0 to 100 with at most two decimal places.
- **Line 14 · Error:** Percentage cannot exceed 100%.
- **Line 19 · Error:** Invalid creator-fee allocation
- **Line 27 · Text / template:** function owner() view returns (address)
- **Line 28 · Text / template:** function upstream() view returns (address)
- **Line 29 · Text / template:** function token() view returns (address)
- **Line 30 · Text / template:** function asset() view returns (address)
- **Line 31 · Text / template:** function active() view returns (bool)
- **Line 32 · Text / template:** function exited() view returns (bool)
- **Line 33 · Text / template:** function everActivated() view returns (bool)
- **Line 34 · Text / template:** function feeControl() view returns (address)
- **Line 35 · Text / template:** function executor() view returns (address)
- **Line 36 · Text / template:** function MAX_QUOTE_LIFETIME() view returns (uint256)
- **Line 37 · Text / template:** function accounted() view returns (uint256)
- **Line 38 · Text / template:** function lifetimeSelfBurned() view returns (uint256)
- **Line 39 · Text / template:** function lifetimeSelfSpend() view returns (uint256)
- **Line 40 · Text / template:** function selfBurnBps() view returns (uint16)
- **Line 41 · Text / template:** function configurationNonce() view returns (uint256)
- **Line 42 · Text / template:** function executionNonce() view returns (uint256)
- **Line 43 · Text / template:** function payableTo(address) view returns (uint256)
- **Line 44 · Text / template:** function burnReserve(address) view returns (uint256)
- **Line 45 · Text / template:** function setPercentage(uint16 bps)
- **Line 46 · Text / template:** function reassign(address nextOwner)
- **Line 47 · Text / template:** function collect()
- **Line 48 · Text / template:** function collectAndPay()
- **Line 49 · Text / template:** function syncDormantOwner()
- **Line 50 · Text / template:** function withdrawFor(address beneficiary)
- **Line 51 · Text / template:** function releaseReserve(uint256 amount)
- **Line 52 · Text / template:** function shareWithHolders()
- **Line 53 · Text / template:** function emergencyExitToOwner()
- **Line 54 · Text / template:** function detach((uint256 maxBuybackAmount,uint256 minArcBotOut,uint256 minSweepBuybackTokensOut,uint256 deadline,address routeTarget,bytes routeData,bytes quoteSignature) authorization)
- **Line 55 · Text / template:** function executeBurn(address beneficiary,uint256 amount,uint256 minimumOut,uint256 issuedAt,uint256 deadline,bytes route,bytes signature) returns (uint256)
- **Line 56 · Text / template:** function burnDigest(address beneficiary,uint256 amount,uint256 minimumOut,uint256 issuedAt,uint256 deadline,bytes32 routeHash) view returns (bytes32)
- **Line 57 · Text / template:** event Allocation(address indexed owner,uint256 received,uint256 cash,uint256 reserve)
- **Line 58 · Text / template:** event SurplusReceived(address indexed owner,uint256 amount)
- **Line 59 · Text / template:** event Paid(address indexed owner,uint256 amount)
- **Line 60 · Text / template:** event SelfBurned(address indexed owner,uint256 spent,uint256 burned)
- **Line 61 · Text / template:** event ConfigurationChanged(address indexed owner,uint16 bps,uint256 nonce)
- **Line 62 · Text / template:** event OwnershipChanged(address indexed previousOwner,address indexed nextOwner)
- **Line 63 · Text / template:** event ReserveReleased(address indexed owner,uint256 amount)
- **Line 64 · Text / template:** event Exited(address indexed recipient)

### lib/creator-burn-receipts.ts

- **Line 4 · Text / template:** event Transfer(address indexed from,address indexed to,uint256 value)
- **Line 23 · Error:** CREATOR_BURN_RECEIPT_NOT_CONFIRMED
- **Line 32 · Error:** CREATOR_BURN_UNRECOGNIZED_LAYER_EVENT
- **Line 35 · Error:** CREATOR_BURN_RECEIPT_LOG_INDEX
- **Line 37 · Error:** CREATOR_BURN_DUPLICATE_RECEIPT_LOG
- **Line 42 · Error:** CREATOR_BURN_ALLOCATION_MISMATCH
- **Line 61 · Error:** CREATOR_BURN_PAYOUT_TRANSFER_MISMATCH
- **Line 69 · Error:** CREATOR_BURN_MULTIPLE_PAYOUTS

### lib/creator-fee-display.ts

- **Line 13 · Dynamic Text / template:** ${symbol.replace(/^\$+/, "")}
- **Line 15 · Dynamic Text / template:** Buyback and burn {ticker}
- **Line 16 · Dynamic Text / template:** ({isArcBotHalfTotal(tokenAddress, bps) ? 50 : bps / 100}% buyback and burn {ticker})

### lib/gecko-shared.ts

- **Line 16 · Error:** invalid Gecko URL
- **Line 29 · Dynamic Text / template:** {paid ? "coingecko-paid" : "gecko"}:{url.slice(COINGECKO_FREE_ONCHAIN_PREFIX.length)}
- **Line 59 · Error:** invalid Gecko payload

### lib/gecko-token-market.ts

- **Line 37 · Error:** too many Gecko token addresses

### lib/launch-metadata-limits.ts

- **Line 3 · Text / template:** Action needed: The special characters in the name or ticker exceed Argus's onchain byte limit. Shorten the name or ticker, then reply with the launch request again.

### lib/otc/base-gas-budget.ts

- **Line 3 · Error:** Settlement gas estimate unavailable.
- **Line 5 · Error:** Settlement gas exceeds policy. Try again later.

### lib/otc/escrow-model.ts

- **Line 9 · Text / template:** function transfer(address,uint256) returns(bool)
- **Line 20 · Error:** Escrow position missing.
- **Line 21 · Error:** Escrow order mismatch.
- **Line 31 · Error:** Escrow wallet is not provisioned.
- **Line 33 · Status / notice:** Another order is settling for this listing.
- **Line 34 · Error:** Combined escrow deposits require Base ETH.
- **Line 35 · Error:** Order is not settling.
- **Line 38 · Status / notice:** Gas recovery is not authorized.
- **Line 39 · Error:** Invalid escrow step.
- **Line 40 · Error:** Escrow deposit or preceding payout is not verified.
- **Line 41 · Error:** Arc escrow deposit is not verified.
- **Line 43 · Error:** Position is not funding.
- **Line 45 · Error:** Position cannot return funds during settlement.
- **Line 46 · Error:** Escrow return does not cover remaining principal within the gas allowance.
- **Line 62 · Error:** Escrow transaction does not match its step.
- **Line 63 · Error:** Invalid escrow reservation.
- **Line 66 · Error:** Gas exceeds the escrow allowance.
- **Line 67 · Error:** Only return gas may reduce unsold funds.
- **Line 72 · Status / notice:** Seller must add Arc USDC for payout gas.
- **Line 75 · Error:** A wallet transaction is pending.
- **Line 79 · Status / notice:** Add funds for the updated network gas allowance.
- **Line 83 · Error:** Escrow funds are not reserved.
- **Line 93 · Error:** Escrow must be a separate wallet.
- **Line 94 · Error:** Escrow wallet binding is immutable.
- **Line 96 · Error:** Escrow name cannot change after provisioning.
- **Line 109 · Error:** Final Arc escrow balance is not verified.
- **Line 111 · Error:** Arc escrow gas balance is pending verification.
- **Line 113 · Error:** Arc escrow gas credits are not covered.
- **Line 128 · Error:** Final escrow balance is not verified.
- **Line 130 · Error:** Escrow gas balance is pending verification.
- **Line 131 · Error:** Escrow gas credits are not covered.
- **Line 138 · Error:** Escrow owner mismatch.
- **Line 145 · Error:** No verified reverted escrow transaction to retry.

### lib/otc/escrow-runtime.ts

- **Line 18 · Status / notice:** Read only
- **Line 20 · Error:** Escrow transaction context missing.
- **Line 22 · Error:** Escrow attempt changed.
- **Line 24 · Error:** Escrow signing authorization mismatch.
- **Line 25 · Error:** Escrow participant wallet is not active.
- **Line 30 · Error:** Escrow account name mismatch.
- **Line 39 · Error:** Escrow transaction reverted. Retry settlement after checking balances.
- **Line 63 · Error:** Arc escrow inventory is not covered.
- **Line 83 · Status / notice:** Add funds for settlement gas. The recovery allowance is already used.
- **Line 85 · Status / notice:** Settlement gas exceeds the small recovery allowance.
- **Line 102 · Error:** Escrow needs gas to return the remaining funds.
- **Line 108 · Error:** Not enough funds for the amount and gas.

### lib/otc/gas-recovery.ts

- **Line 10 · Status / notice:** Listing principal is not dust.
- **Line 11 · Status / notice:** Return already has a transaction.
- **Line 12 · Status / notice:** Funding is not verified.
- **Line 14 · Status / notice:** Dust balance is not current.
- **Line 16 · Status / notice:** Remainder exceeds the dust limit.
- **Line 26 · Status / notice:** Funding amount is already fixed.
- **Line 29 · Status / notice:** Funding gas exceeds the recovery allowance.
- **Line 40 · Status / notice:** Payouts must be verified before retaining dust.
- **Line 41 · Status / notice:** Refund already has a transaction.
- **Line 56 · Status / notice:** Payment must be verified before gas recovery.
- **Line 58 · Status / notice:** Gas recovery exceeds the small network allowance.

### lib/otc/http.ts

- **Line 13 · Error:** Connect your account first.
- **Line 15 · Error:** Reconnect your account.
- **Line 18 · Error:** Invalid request origin.
- **Line 19 · Error:** Invalid session token.
- **Line 20 · Error:** Reconnect before moving funds.
- **Line 21 · Error:** Wallet ownership or active status could not be verified.
- **Line 32 · Text / template:** Configure ARC_MAINNET_RPC_URL, ARC_CHECKPOINT_NUMBER and ARC_CHECKPOINT_HASH
- **Line 33 · Text / template:** Arc transaction settings are missing on the website server. Contact Argos Bot support.
- **Line 35 · Text / template:** Wallet signing is not configured on the website server. Contact Argos Bot support.
- **Line 37 · Text / template:** Wallet reservation service is unavailable. Contact Argos Bot support.
- **Line 38 · Text / template:** No healthy Arc RPC supports this request
- **Line 39 · Text / template:** Arc network request failed. Check transaction history before retrying.
- **Line 41 · Text / template:** No supported trading route has liquidity for this token pair.
- **Line 43 · Text / template:** Request could not be confirmed. Check order or transaction history before retrying.

### lib/otc/listing-preview.ts

- **Line 11 · Error:** Wallet has a pending transaction.
- **Line 16 · Error:** Gas exceeds the configured policy.
- **Line 21 · Error:** Not enough available USDC for this listing budget.

### lib/otc/listing-submission.ts

- **Line 5 · Error:** Listing request ID belongs to different or unverifiable terms. Check your listings.
- **Line 8 · Error:** Invalid saved listing request.

### lib/otc/model.ts

- **Line 8 · Text / template:** ETH
- **Line 13 · Error:** Minimum amount is 10 Arc USDC.
- **Line 14 · Error:** Amount exceeds the listing limit.
- **Line 18 · Error:** Enter a premium from 0% to 10,000%, with up to two decimal places.
- **Line 21 · Error:** Maximum premium is 10,000%.
- **Line 25 · Error:** Invalid OTC price inputs.
- **Line 76 · Error:** Wallet owner mismatch.
- **Line 80 · Error:** A wallet transaction is pending. Wait for confirmation.
- **Line 81 · Error:** Balance snapshot is behind the last wallet transaction.
- **Line 84 · Error:** Invalid reservation.
- **Line 86 · Error:** Not enough available funds, including gas and existing reservations.
- **Line 102 · Error:** Gas estimate is unavailable.
- **Line 106 · Error:** Minimum listing is 10 USDC after gas. Increase the total amount.
- **Line 115 · Error:** Listing identity or terms mismatch.
- **Line 122 · Error:** Not enough available USDC for this listing budget.
- **Line 122 · Dynamic Error:** You don't have enough for gas on top of {input.amount} USDC.
- **Line 130 · Error:** Quote owner mismatch.
- **Line 132 · Error:** Listing is not available.
- **Line 133 · Error:** Listing is settling another order. Try again shortly.
- **Line 134 · Error:** You cannot buy your own listing.
- **Line 136 · Error:** Listing amount changed. Request a new quote.
- **Line 137 · Error:** Price or gas estimate expired.
- **Line 138 · Error:** Unsupported Base payment asset.
- **Line 144 · Error:** Not enough available Base USDC or approval gas allowance.
- **Line 145 · Error:** Invalid escrow payment terms.
- **Line 146 · Error:** Not enough available Base ETH for this quote and gas.
- **Line 159 · Error:** Order not found.
- **Line 161 · Error:** Payment options changed. Request a new ETH quote.
- **Line 162 · Error:** Quote expired. Request a new quote.
- **Line 165 · Error:** Seller balance or gas reserve is insufficient. No Base payment was sent.
- **Line 170 · Error:** A Base USDC purchase is pending. Wait for payment verification.
- **Line 171 · Error:** Not enough available Base USDC.
- **Line 179 · Error:** Listing not found.
- **Line 183 · Error:** Position is locked by its funding transaction. Wait for verification.
- **Line 192 · Error:** Position is locked by a pending quote or transaction. Wait for settlement.
- **Line 198 · Error:** Only unsigned expired quotes can be released.
- **Line 200 · Error:** Listing record missing.
- **Line 204 · Error:** Reservation mismatch.

### lib/otc/native-spend.ts

- **Line 12 · Error:** Arc USDC transfer amount is unavailable.

### lib/otc/order-display.ts

- **Line 9 · Text / template:** Received
- **Line 10 · Text / template:** Payment failed
- **Line 11 · Text / template:** Payout failed
- **Line 12 · Text / template:** Pending

### lib/otc/repository.ts

- **Line 7 · Error:** OTC storage is not configured.

### lib/otc/runtime.ts

- **Line 25 · Dynamic Error:** {key} is not configured.
- **Line 26 · Text / template:** function approve(address,uint256) returns (bool)
- **Line 26 · Text / template:** function approve(address,address,uint160,uint48)
- **Line 26 · Text / template:** function allowance(address,address) view returns (uint256)
- **Line 26 · Text / template:** function allowance(address,address,address) view returns (uint160,uint48,uint48)
- **Line 36 · Error:** Invalid OTC payment configuration.
- **Line 49 · Error:** Balance snapshot changed.
- **Line 56 · Error:** Base payment contract does not match the configured deployment.
- **Line 64 · Error:** Base payment contract does not support native USDC.
- **Line 67 · Error:** Base USDC reservation is not covered.
- **Line 71 · Error:** ETH/USD price is unavailable.
- **Line 73 · Error:** Invalid ETH/USD price response.
- **Line 80 · Error:** Wallet has a pending transaction.
- **Line 82 · Error:** Not enough funds for the amount and gas.
- **Line 89 · Error:** Gas exceeds the configured policy.
- **Line 95 · Error:** Invalid Base fee estimate.
- **Line 97 · Error:** Base fees exceed the configured cap.
- **Line 103 · Error:** Expected an EIP-1559 transaction.
- **Line 108 · Error:** Signer returned a different transaction.
- **Line 120 · Error:** Payment configuration changed. Recovery required.
- **Line 124 · Error:** Stored transaction chain mismatch.
- **Line 128 · Error:** Stored settlement transaction does not match the order.
- **Line 142 · Error:** Social command authorization changed.
- **Line 145 · Error:** Invalid Arc swap target.
- **Line 147 · Error:** Arc router code changed.
- **Line 151 · Error:** Wallet ownership or active status changed before signing.
- **Line 152 · Error:** Wallet nonce changed before signing. Recovery required.
- **Line 154 · Error:** Wallet reservation is not covered.
- **Line 156 · Error:** Transaction amount and gas exceed its reservation.
- **Line 182 · Error:** Stored signature hash mismatch.
- **Line 190 · Error:** Receipt is not canonical.
- **Line 192 · Error:** Receipt transaction does not match the order.
- **Line 196 · Error:** Token delivery evidence unavailable.
- **Line 205 · Error:** Swap delivery terms missing.
- **Line 207 · Error:** Unsupported swap recipient.
- **Line 208 · Error:** Native output must go to the wallet.
- **Line 211 · Error:** Unsupported native swap chain.
- **Line 213 · Text / template:** Transfer
- **Line 219 · Error:** Invalid swap receipt amount.
- **Line 220 · Text / template:** function decimals() view returns (uint8)
- **Line 222 · Error:** Minimum swap output was not delivered.
- **Line 230 · Error:** Arc delivery block changed.
- **Line 236 · Error:** Arc gas receipt mismatch.
- **Line 239 · Error:** Arc gas transaction missing.
- **Line 252 · Error:** Approval terms missing.
- **Line 254 · Error:** Invalid approval call.
- **Line 257 · Error:** Token approval was not verified.
- **Line 260 · Error:** Router approval was not verified.
- **Line 265 · Text / template:** Approval
- **Line 267 · Error:** USDC approval was not verified.
- **Line 271 · Text / template:** PaidUsdc
- **Line 271 · Text / template:** Paid
- **Line 274 · Error:** Base split payment was not verified.
- **Line 278 · Error:** Base delivery evidence unavailable.
- **Line 283 · Error:** Receipt changed during verification.
- **Line 291 · Error:** Finality evidence changed.
- **Line 295 · Error:** Nonce consumed without a verified receipt. Funds remain reserved.
- **Line 297 · Error:** Signed request is no longer covered by wallet reservations.
- **Line 307 · Error:** Base fees exceeded the reserved allowance. Signature retained for recovery.
- **Line 312 · Error:** Broadcast returned the wrong hash.
- **Line 329 · Error:** Order missing.
- **Line 340 · Dynamic Text / template:** tx:{id}:{leg}{leg==="payout" && order.payoutAttempt ? \`:${order.payoutAttempt}\` : ""}
- **Line 347 · Error:** Seller cannot cover the exact Arc payout and reserved gas.
- **Line 351 · Error:** Gas exceeded the accepted reserve. Order remains reserved.
- **Line 375 · Text / template:** Escrow wallet setup is pending. Listing funds remain reserved in your wallet.

### lib/otc/settlement-error.ts

- **Line 8 · Text / template:** Settlement blocked: wallet signing needs operator attention. Funds remain protected.
- **Line 9 · Text / template:** Base RPC is busy. Settlement will retry automatically.
- **Line 10 · Text / template:** Settlement paused: gas exceeds this order's allowance.
- **Line 11 · Text / template:** Settlement blocked: gas recovery allowance is exhausted. Operator assistance is required.
- **Line 12 · Text / template:** Settlement blocked: gas exceeds the automatic recovery limit. Operator assistance is required.
- **Line 13 · Text / template:** Settlement blocked: insufficient funds for gas. Add funds to the paying wallet and contact support to resume settlement.
- **Line 14 · Text / template:** Settlement blocked: network fees exceed the allowed gas budget. Operator assistance is required.
- **Line 17 · Text / template:** Pending verification

### lib/otc/token-delivery.ts

- **Line 3 · Text / template:** function transfer(address recipient,uint256 amount) returns (bool)
- **Line 4 · Text / template:** function balanceOf(address account) view returns (uint256)
- **Line 5 · Text / template:** event Transfer(address indexed from,address indexed to,uint256 value)
- **Line 9 · Error:** Unsupported token send calldata.
- **Line 11 · Error:** Expected token transfer.
- **Line 18 · Error:** Token transfer simulation did not return success.
- **Line 29 · Error:** Block delivery evidence is incomplete. Funds remain reserved.
- **Line 37 · Text / template:** Transfer
- **Line 53 · Error:** Exact token delivery is not verified. Funds remain reserved.

### lib/otc/transaction-history.ts

- **Line 7 · Text / template:** function transfer(address recipient,uint256 amount)
- **Line 7 · Text / template:** function approve(address spender,uint256 amount)
- **Line 7 · Text / template:** function approve(address token,address spender,uint160 amount,uint48 expiration)
- **Line 7 · Text / template:** function execute(bytes commands,bytes[] inputs,uint256 deadline)
- **Line 12 · Text / template:** USDC
- **Line 12 · Text / template:** ETH
- **Line 13 · Dynamic Text / template:** {raw} base units · {address}
- **Line 15 · Dynamic Text / template:** {gas||native&&chain===8453?exact:displayAmount(exact,symbol==="USDC"?2:0)} {symbol??address}
- **Line 17 · Text / template:** Base gas recovery
- **Line 17 · Text / template:** Arc gas recovery
- **Line 17 · Text / template:** Send
- **Line 17 · Text / template:** Swap
- **Line 17 · Text / template:** Token approval
- **Line 17 · Text / template:** Payment approval
- **Line 17 · Text / template:** OTC payment
- **Line 17 · Text / template:** OTC payout
- **Line 17 · Text / template:** Fund OTC position
- **Line 17 · Text / template:** Return remaining USDC
- **Line 17 · Text / template:** Deposit settlement gas
- **Line 17 · Text / template:** Deposit OTC payment
- **Line 17 · Text / template:** Deliver Arc USDC
- **Line 17 · Text / template:** Pay seller
- **Line 17 · Text / template:** Service fee
- **Line 17 · Text / template:** Return unused gas
- **Line 23 · Dynamic Text / template:** OTC {record.escrowRef?.step?.replaceAll("_"," ")??record.leg}
- **Line 25 · Text / template:** Buy and burn
- **Line 25 · Text / template:** Burn destination
- **Line 27 · Text / template:** Buy and send
- **Line 27 · Text / template:** To
- **Line 33 · Text / template:** Amount
- **Line 41 · Text / template:** Approval limit
- **Line 41 · Text / template:** Spender
- **Line 47 · Text / template:** Input
- **Line 47 · Text / template:** Minimum output
- **Line 47 · Text / template:** Route
- **Line 53 · Text / template:** V4 · 2 pools
- **Line 65 · Text / template:** Received
- **Line 68 · Text / template:** Gas paid

### lib/otc/transactions.ts

- **Line 9 · Text / template:** function pay(bytes32 orderId,address seller,uint256 sellerWei,address arcBuyer,uint256 arcUsdcUnits) payable
- **Line 10 · Text / template:** function payUsdc(bytes32 orderId,address seller,uint256 sellerUnits,address arcBuyer,uint256 arcUsdcUnits)
- **Line 11 · Text / template:** function usdc() view returns (address)
- **Line 12 · Text / template:** event PaidUsdc(bytes32 indexed orderId,address indexed buyer,address indexed seller,address arcBuyer,uint256 arcUsdcUnits,uint256 sellerWei,uint256 feeWei)
- **Line 13 · Text / template:** function feeRecipient() view returns (address)
- **Line 14 · Text / template:** event Paid(bytes32 indexed orderId,address indexed buyer,address indexed seller,address arcBuyer,uint256 arcUsdcUnits,uint256 sellerWei,uint256 feeWei)
- **Line 21 · Error:** Approval requires a USDC order.
- **Line 30 · Error:** Order not found.
- **Line 31 · Error:** Order recovery changed. Refresh the order.
- **Line 32 · Error:** Order is not eligible for payout recovery.
- **Line 34 · Error:** Finalized payout failure is not verified.
- **Line 37 · Error:** Seller must add Arc USDC to cover reserved funds and retry gas.
- **Line 40 · Text / template:** Payout retry recorded. Funds remain reserved until delivery is verified.
- **Line 47 · Error:** Transaction identity mismatch.
- **Line 53 · Error:** Order missing.
- **Line 56 · Error:** Approval is not authorized.
- **Line 57 · Error:** Approval must be finalized first.
- **Line 59 · Error:** Settlement leg is not authorized.
- **Line 62 · Error:** Transaction exceeds its reservation.
- **Line 63 · Error:** Wallet no longer covers its reservations.
- **Line 72 · Error:** Not enough available Base USDC.
- **Line 82 · Error:** Transaction missing.
- **Line 83 · Error:** Signed transaction is immutable.
- **Line 84 · Error:** Transaction cannot be signed.
- **Line 90 · Error:** Persist the signature before broadcasting.
- **Line 107 · Error:** Signed transaction missing.
- **Line 110 · Error:** Invalid settlement amounts.
- **Line 114 · Error:** Wallet transaction lease mismatch.
- **Line 143 · Text / template:** Arc payout reverted. Funds remain reserved. Operator recovery required.

### lib/otc/unsigned-recovery.ts

- **Line 4 · Text / template:** function execute(bytes,bytes[],uint256)
- **Line 12 · Status / notice:** Transaction is no longer awaiting a signature.
- **Line 14 · Status / notice:** Wallet transaction lease mismatch.
- **Line 22 · Status / notice:** Transaction cannot be safely cancelled.
- **Line 26 · Text / template:** Trade expired before signing. Funds released. Submit again for a fresh quote.

### lib/project-config.ts

- **Line 5 · Text / template:** TheArgosBot
- **Line 15 · Error:** Configure an HTTPS website origin for the wallet worker.

### lib/public-links.ts

- **Line 5 · Status / notice:** Invalid wallet address
- **Line 6 · Dynamic Text / template:** {ARC_BOT_SITE_URL}/wallet/{address}{requestId ? \`?request=${encodeURIComponent(requestId)}\` : ""}
- **Line 9 · Status / notice:** Invalid Arc transaction hash
- **Line 13 · Status / notice:** Invalid Arc address
- **Line 17 · Dynamic Text / template:** Transaction: {chainId===8453?\`https://basescan.org/tx/${hash}\`:arcTransactionUrl(hash)}
- **Line 17 · Dynamic Text / template:** Your wallet: {arcWalletUrl(address)}

### lib/rpc-http.ts

- **Line 54 · Error:** RPC request failed after retries

### lib/shared-wallet-execution-cache.ts

- **Line 12 · Dynamic Text / template:** {kind}:{parts.map((part) => part.trim().toLowerCase()).join(":")}

### lib/signer-diagnostics.ts

- **Line 6 · Text / template:** Bearer [redacted]

### lib/site-data.ts

- **Line 28 · Error:** Public site data is not configured
- **Line 35 · Error:** Launch data is temporarily unavailable
- **Line 83 · Error:** Platform statistics are temporarily unavailable
- **Line 110 · Error:** Wallet data is temporarily unavailable
- **Line 125 · Text / template:** USD Coin
- **Line 125 · Text / template:** USDC

### lib/site-metadata.ts

- **Line 5 · Text / template:** Argos Bot - Your Gateway to Arc Chain
- **Line 6 · Text / template:** Your Arc Chain Wallet. Buy, sell, swap, and send Arc tokens with Argos Bot.
- **Line 13 · Text / template:** Argos Bot

### lib/telegram-link-consent.ts

- **Line 7 · Dynamic Text / template:** {data}.{createHmac("sha256", secret).update(\`telegram-consent:${data}\`).digest("hex")}

### lib/token-market-cap.ts

- **Line 14 · Text / template:** function getLaunchedToken(address token) view returns ((address token,address curve,address deployer,address creatorFeeRecipient,address pairToken,uint256 graduationThreshold,uint24 poolFee,int24 tickSpacing,uint16 creatorTaxBps,bool buybackEnabled,uint8 phase,uint256 sweptQuote,uint256 sweptTokens,uint256 sweptAt,bool exists) launched)
- **Line 15 · Text / template:** function memeHook() view returns (address)
- **Line 17 · Text / template:** function getReserves() view returns (uint256 quoteReserve,uint256 tokenReserve)
- **Line 18 · Text / template:** function totalSupply() view returns (uint256)
- **Line 18 · Text / template:** function decimals() view returns (uint8)
- **Line 18 · Text / template:** function symbol() view returns (string)
- **Line 20 · Text / template:** function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96,int24 tick,uint24 protocolFee,uint24 lpFee)
- **Line 21 · Text / template:** function getLiquidity(bytes32 poolId) view returns (uint128 liquidity)
- **Line 139 · Error:** indexed V4 paired asset has no active liquidity
- **Line 143 · Error:** indexed V4 paired asset price is invalid
- **Line 151 · Error:** paired asset price is unavailable
- **Line 156 · Error:** paired asset price is stale or unverified
- **Line 158 · Error:** paired asset price is invalid

### lib/token-pattern.ts

- **Line 29 · Dynamic Text / template:** [{negative}{escaped}{scripts}{body.includes("0-9") ? "\\p{M}" : ""}]

### lib/usdg-reference-price.ts

- **Line 7 · Text / template:** function getPool(address,address,uint24) view returns(address)
- **Line 8 · Text / template:** function slot0() view returns(uint160,int24,uint16,uint16,uint16,uint8,bool)
- **Line 9 · Text / template:** function liquidity() view returns(uint128)
- **Line 15 · Error:** USDG reference pool unavailable
- **Line 23 · Error:** USDG reference price unavailable

### lib/wallet-holdings.ts

- **Line 42 · Text / template:** Token

### lib/wallet-native-gas.ts

- **Line 4 · Text / template:** You'll need to fund your wallet with ETH for gas to complete this transaction. Fund it, then reply “resume”.
- **Line 7 · Text / template:** insufficient ETH for gas: wallet has zero native ETH
- **Line 14 · Status / notice:** insufficient ETH for gas: wallet has zero native ETH
- **Line 17 · Text / template:** complete this transaction
- **Line 20 · Dynamic Text / template:** You'll need to fund your wallet with ETH for gas to {action}. Fund it, then reply “resume”.
- **Line 21 · Dynamic Text / template:** {message} Your wallet: {arcWalletUrl(address)}
- **Line 31 · Error:** Invalid native ETH balance response
- **Line 36 · Error:** Invalid wallet address for native ETH check

### lib/wallet-signer/creator-burn-enrollment.ts

- **Line 43 · Text / template:** function create(address) returns(address)
- **Line 44 · Text / template:** function layerOf(address) view returns(address)
- **Line 45 · Text / template:** function controller() view returns(address)
- **Line 46 · Text / template:** function beneficiary() view returns(address)
- **Line 47 · Text / template:** function active() view returns(bool)
- **Line 48 · Text / template:** function primaryFactory() view returns(address)
- **Line 49 · Text / template:** function isVault(address) view returns(bool)
- **Line 50 · Text / template:** function feeControl() view returns(address)
- **Line 51 · Text / template:** function admin() view returns(address)
- **Line 52 · Text / template:** function executor() view returns(address)
- **Line 53 · Text / template:** function registry() view returns(address)
- **Line 54 · Text / template:** function predictLayerAddress(address,address,uint16,bytes32) view returns(address)
- **Line 55 · Text / template:** function create(address,address,uint16,bytes32) returns(address)
- **Line 61 · Error:** CREATOR_BURN_DISABLED
- **Line 63 · Error:** Wrong chain
- **Line 68 · Error:** CREATOR_BURN_CODE_PIN_MISMATCH
- **Line 75 · Error:** CREATOR_BURN_REGISTRY_MISMATCH
- **Line 77 · Text / template:** ADMIN
- **Line 77 · Text / template:** KEEPER
- **Line 79 · Error:** CREATOR_BURN_SERVICE_UNFUNDED
- **Line 107 · Error:** CREATOR_BURN_ADMIN_MISMATCH
- **Line 140 · Error:** CREATOR_BURN_PREDICTION_MISMATCH
- **Line 144 · Error:** CREATOR_BURN_PREBOUND_PRIMARY_MISMATCH
- **Line 153 · Error:** New-launch layer envelope mismatch
- **Line 174 · Error:** Layer admin underfunded
- **Line 257 · Error:** Layer deployment envelope mismatch
- **Line 293 · Error:** CREATOR_BURN_ENROLLMENT_OWNER_CHANGED
- **Line 314 · Error:** Layer deployment exceeds 0.003 ETH ceiling

### lib/wallet-signer/creator-burn.ts

- **Line 52 · Text / template:** function layerOf(address) view returns(address)
- **Line 53 · Text / template:** function isLayer(address) view returns(bool)
- **Line 54 · Text / template:** function isVault(address) view returns(bool)
- **Line 55 · Text / template:** function primaryFactory() view returns(address)
- **Line 56 · Text / template:** function feeControl() view returns(address)
- **Line 57 · Text / template:** function executor() view returns(address)
- **Line 58 · Text / template:** function registry() view returns(address)
- **Line 59 · Text / template:** function argusFactory() view returns(address)
- **Line 62 · Text / template:** function controller() view returns(address)
- **Line 63 · Text / template:** function beneficiary() view returns(address)
- **Line 64 · Text / template:** function token() view returns(address)
- **Line 65 · Text / template:** function pairAsset() view returns(address)
- **Line 68 · Text / template:** function claimable(address,address) view returns(uint256)
- **Line 71 · Text / template:** function buyAndBurn(address asset,address token,uint256 amount,uint256 minimum,bytes route) payable returns(uint256)
- **Line 74 · Text / template:** function approve(address,uint256) returns(bool)
- **Line 75 · Text / template:** function decimals() view returns(uint8)
- **Line 86 · Error:** CREATOR_BURN_DISABLED
- **Line 110 · Error:** CREATOR_BURN_NOT_CONFIGURED
- **Line 115 · Error:** CREATOR_BURN_WRONG_CHAIN
- **Line 129 · Error:** CREATOR_BURN_AMBIGUOUS_REGISTRY
- **Line 134 · Error:** CREATOR_BURN_UNKNOWN_LAYER
- **Line 147 · Error:** CREATOR_BURN_CODE_PIN_MISMATCH
- **Line 183 · Error:** CREATOR_BURN_REGISTRY_MISMATCH
- **Line 273 · Error:** CREATOR_BURN_BINDING_MISMATCH
- **Line 280 · Error:** CREATOR_BURN_CONTROL_MISMATCH
- **Line 314 · Error:** CREATOR_BURN_LAYER_MISSING
- **Line 357 · Error:** CREATOR_BURN_REQUEST_INCOMPLETE
- **Line 368 · Error:** CREATOR_BURN_INACTIVE
- **Line 374 · Error:** CREATOR_BURN_NO_CASH
- **Line 382 · Error:** CREATOR_BURN_NO_RESERVE
- **Line 388 · Error:** CREATOR_BURN_GRADUATING
- **Line 425 · Error:** CREATOR_BURN_QUOTE_SIMULATION_FAILED
- **Line 433 · Error:** CREATOR_BURN_DUST
- **Line 438 · Error:** CREATOR_BURN_STALE_QUOTE
- **Line 468 · Error:** CREATOR_BURN_QUOTE_NONCE_CHANGED
- **Line 503 · Error:** CREATOR_BURN_KEEPER_UNDERFUNDED
- **Line 543 · Dynamic Text / template:** creator-layer:{keccak256(encodeAbiParameters([{ type: "string" }, { type: "bytes" }], [r.idempotencyKey, unsigned]))}
- **Line 562 · Error:** CREATOR_BURN_ENVELOPE_MISSING
- **Line 579 · Error:** CREATOR_BURN_ENVELOPE_MISMATCH
- **Line 592 · Error:** CREATOR_BURN_CALL_NOT_ALLOWED
- **Line 603 · Error:** CREATOR_BURN_RECEIPT_IDENTITY_MISSING
- **Line 652 · Error:** CREATOR_BURN_RECEIPT_BINDING
- **Line 729 · Error:** CREATOR_BURN_REPLACEMENT_FEE_ABOVE_CURRENT_MARKET_CAP
- **Line 798 · Error:** CREATOR_BURN_HISTORY_SINGLE_BLOCK_TOO_DENSE
- **Line 809 · Error:** CREATOR_BURN_HISTORY_NOT_FINAL
- **Line 835 · Error:** CREATOR_BURN_DELIVERY_HISTORY_CATCHING_UP
- **Line 851 · Error:** CREATOR_BURN_DELIVERY_ALLOCATION_NOT_FINAL

### lib/wallet-signer/fee-accumulation.ts

- **Line 5 · Text / template:** function quoteFeeBalance() view returns (uint256)
- **Line 6 · Text / template:** function creatorTaxBalance() view returns (uint256)
- **Line 7 · Text / template:** function buybackQuoteBalance() view returns (uint256)
- **Line 8 · Text / template:** function protocolFeeShareBps() view returns (uint16)
- **Line 11 · Text / template:** function pendingFees(bytes32,address) view returns (uint256)
- **Line 12 · Text / template:** function pendingCreatorTax(bytes32,address) view returns (uint256)
- **Line 13 · Text / template:** function pendingBuyback(bytes32,address) view returns (uint256)
- **Line 16 · Text / template:** function memeHook() view returns (address)
- **Line 17 · Text / template:** function getLaunchFeePolicy(address) view returns ((address protocolFeeRecipient,uint16 protocolFeeShareBps,uint16 buybackBurnBps,uint16 hookFeeBps,uint16 maxInternalPriceImpactBps))
- **Line 57 · Error:** AUTOMATED_FEE_ACCUMULATION_QUOTE_UNAVAILABLE

### lib/wallet-signer/gas.ts

- **Line 28 · Error:** current EIP-1559 fees are unavailable
- **Line 56 · Error:** estimated cost must not be negative
- **Line 61 · Error:** invalid gas estimate
- **Line 77 · Error:** transaction value must not be negative
- **Line 89 · Text / template:** insufficient ETH for gas
- **Line 90 · Dynamic Text / template:** {reason} [gas_estimate_wei={sendAllGasReserve(estimatedGas, actualFeePerGas)}]
- **Line 95 · Error:** launch fee must not be negative
- **Line 106 · Error:** insufficient ETH for gas
- **Line 111 · Error:** ETH amount resolves to zero after reserving gas

### lib/wallet-signer/legacy-fee-preflight.ts

- **Line 4 · Text / template:** function quoteFeeBalance() view returns (uint256)
- **Line 5 · Text / template:** function creatorTaxBalance() view returns (uint256)
- **Line 6 · Text / template:** function buybackQuoteBalance() view returns (uint256)

### lib/wallet-signer/policy.ts

- **Line 10 · Text / template:** amount must be positive
- **Line 12 · Text / template:** percentage cannot exceed 100
- **Line 15 · Text / template:** free launch grant exceeds safety cap
- **Line 44 · Text / template:** paired asset is required
- **Line 45 · Text / template:** paired asset is only valid for pair amounts
- **Line 102 · Text / template:** Operation not supported.
- **Line 146 · Text / template:** launch operation required
- **Line 238 · Text / template:** curve sweep cannot specify a conversion minimum
- **Line 241 · Text / template:** graduated sweep requires a positive conversion minimum
- **Line 244 · Text / template:** sweep requires a positive buyback minimum
- **Line 288 · Text / template:** invalid V3 automated pair route
- **Line 291 · Text / template:** invalid V4 automated pair route

### lib/wallet-signer/pricing.ts

- **Line 13 · Dynamic Error:** price source failed ({response.status})
- **Line 20 · Dynamic Error:** {source} ETH/USD price is stale
- **Line 27 · Text / template:** Coinbase
- **Line 39 · Text / template:** CoinGecko
- **Line 53 · Error:** ETH/USD price source returned an invalid value
- **Line 56 · Error:** ETH/USD price sources disagree
- **Line 72 · Error:** USD amount must be positive
- **Line 73 · Error:** ETH/USD price is invalid
- **Line 78 · Error:** USD amount is too small to convert to ETH

### lib/wallet-signer/service.ts

- **Line 35 · Text / template:** function balanceOf(address owner) view returns (uint256)
- **Line 36 · Text / template:** function decimals() view returns (uint8)
- **Line 37 · Text / template:** function symbol() view returns (string)
- **Line 38 · Text / template:** function name() view returns (string)
- **Line 39 · Text / template:** function totalSupply() view returns (uint256)
- **Line 40 · Text / template:** function nonces(address owner) view returns (uint256)
- **Line 41 · Text / template:** function allowance(address owner,address spender) view returns (uint256)
- **Line 42 · Text / template:** function approve(address spender,uint256 amount) returns (bool)
- **Line 43 · Text / template:** function transfer(address recipient,uint256 amount) returns (bool)
- **Line 46 · Text / template:** function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)
- **Line 47 · Text / template:** function exactInput((bytes path,address recipient,uint256 amountIn,uint256 amountOutMinimum)) payable returns (uint256 amountOut)
- **Line 48 · Text / template:** function selfPermitIfNecessary(address token,uint256 value,uint256 deadline,uint8 v,bytes32 r,bytes32 s) payable
- **Line 49 · Text / template:** function unwrapWETH9(uint256 amountMinimum,address recipient) payable
- **Line 50 · Text / template:** function multicall(bytes[] data) payable returns (bytes[] results)
- **Line 53 · Text / template:** function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)
- **Line 54 · Text / template:** function quoteExactInput(bytes path,uint256 amountIn) returns (uint256 amountOut,uint160[] sqrtPriceX96AfterList,uint32[] initializedTicksCrossedList,uint256 gasEstimate)
- **Line 57 · Text / template:** function previewLaunchEconomics(uint256 launchConfigId,address pairToken) view returns (bytes32)
- **Line 58 · Text / template:** function launchFee() view returns (uint256)
- **Line 59 · Text / template:** function getLaunchConfig(uint256 id) view returns ((uint256 supply,uint256 curveFeeBps,uint256 phantomQuote,uint256 graduationThreshold,uint24 poolFee,int24 tickSpacing,bool enabled))
- **Line 60 · Text / template:** function pairTokenEconomics(address token) view returns ((uint256 phantomQuote,uint256 graduationThreshold,uint8 decimals))
- **Line 61 · Text / template:** function launchDeployer() view returns (address)
- **Line 62 · Text / template:** function buybackVault() view returns (address)
- **Line 63 · Text / template:** function launchToken((string name,string symbol,string logo,string description,(string twitter,string telegram,string discord,string website,string farcaster) socials,address creatorFeeRecipient,uint16 creatorTaxBps,bool buybackEnabled,bytes32 expectedEconomics,bytes32 salt) params,uint256 launchConfigId,address pairToken,address[] snipeTaxExemptions) payable returns (address token,address curve)
- **Line 64 · Text / template:** event TokenLaunched(address indexed token,address indexed curve,address indexed deployer,address pairToken,uint256 launchConfigId,uint256 graduationThreshold)
- **Line 65 · Text / template:** function getLaunchedToken(address token) view returns ((address token,address curve,address deployer,address creatorFeeRecipient,address pairToken,uint256 graduationThreshold,uint24 poolFee,int24 tickSpacing,uint16 creatorTaxBps,bool buybackEnabled,uint8 phase,uint256 sweptQuote,uint256 sweptTokens,uint256 sweptAt,bool exists) launched)
- **Line 66 · Text / template:** function memeHook() view returns (address)
- **Line 67 · Text / template:** function feeEscrow() view returns (address)
- **Line 68 · Text / template:** function transferCreatorFeeRecipient(address token,address newRecipient)
- **Line 69 · Text / template:** event CreatorFeeRecipientUpdated(address indexed token,address indexed previousRecipient,address indexed newRecipient)
- **Line 72 · Text / template:** function createFor(address token) returns (address distributor)
- **Line 73 · Text / template:** function distributorOf(address token) view returns (address)
- **Line 74 · Text / template:** event DistributorCreated(address indexed token,address indexed distributor)
- **Line 77 · Text / template:** function balanceOf(address recipient) view returns (uint256)
- **Line 78 · Text / template:** function balanceOfToken(address recipient,address token) view returns (uint256)
- **Line 79 · Text / template:** function claim()
- **Line 80 · Text / template:** function claimToken(address token)
- **Line 81 · Text / template:** event Claimed(address indexed recipient,uint256 amount)
- **Line 82 · Text / template:** event ClaimedToken(address indexed recipient,address indexed token,uint256 amount)
- **Line 85 · Text / template:** function buy(uint256 quoteIn,uint256 minTokensOut,address recipient) payable returns (uint256 tokensOut)
- **Line 86 · Text / template:** function sell(uint256 tokensIn,uint256 minQuoteOut,address recipient) returns (uint256 quoteOut)
- **Line 87 · Text / template:** function sweepFees(uint256 minBuybackTokensOut)
- **Line 90 · Text / template:** function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)
- **Line 92 · Text / template:** function execute(bytes commands,bytes[] inputs,uint256 deadline) payable
- **Line 93 · Text / template:** function allowance(address owner,address token,address spender) view returns (uint160 amount,uint48 expiration,uint48 nonce)
- **Line 95 · Text / template:** function launchAndBuy((string name,string symbol,string logo,string description,(string twitter,string telegram,string discord,string website,string farcaster) socials,address creatorFeeRecipient,uint16 creatorTaxBps,bool buybackEnabled,bytes32 expectedEconomics,bytes32 salt) params,uint256 launchConfigId,address pairToken,uint256 quoteIn,uint256 minTokensOut,address recipient,address[] snipeTaxExemptions) payable returns (address token,address curve,uint256 tokensOut)
- **Line 96 · Text / template:** event Launched(address indexed token,address indexed curve,address indexed recipient,address launcher,uint256 quoteSpent,uint256 tokensReceived)
- **Line 99 · Text / template:** function predictLaunchAddresses((address pairToken,address creatorFeeRecipient,address originalDeployer,address feePolicy,(address protocolFeeRecipient,uint16 protocolFeeShareBps,uint16 buybackBurnBps,uint16 hookFeeBps,uint16 maxInternalPriceImpactBps) policy,address feeEscrow,address buybackVault,uint256 phantomQuote,uint256 curveFeeBps,uint256 creatorTaxBps,bool buybackEnabled,uint256 graduationThreshold,uint256 supply,bytes32 salt,string name,string symbol,string logo,string description,(string twitter,string telegram,string discord,string website,string farcaster) socials)) view returns (address token,address curve)
- **Line 101 · Text / template:** function currentFeePolicy() view returns ((address protocolFeeRecipient,uint16 protocolFeeShareBps,uint16 buybackBurnBps,uint16 hookFeeBps,uint16 maxInternalPriceImpactBps))
- **Line 103 · Text / template:** function pairAsset() view returns (address)
- **Line 104 · Text / template:** function token() view returns (address)
- **Line 105 · Text / template:** function argusFactory() view returns (address)
- **Line 107 · Text / template:** function executionNonce() view returns (uint256)
- **Line 108 · Text / template:** function active() view returns (bool)
- **Line 109 · Text / template:** function paused() view returns (bool)
- **Line 110 · Text / template:** function controller() view returns (address)
- **Line 111 · Text / template:** function beneficiary() view returns (address)
- **Line 112 · Text / template:** function claimable(address beneficiary,address asset) view returns (uint256)
- **Line 113 · Text / template:** function lastCurveSweepBlock() view returns (uint256)
- **Line 114 · Text / template:** function lastGraduatedSweepBlock() view returns (uint256)
- **Line 115 · Text / template:** function sweepCurveFees(uint256 minBuybackTokensOut)
- **Line 116 · Text / template:** function sweepGraduatedFees(uint256 minConversionQuoteOut,uint256 minBuybackTokensOut)
- **Line 117 · Text / template:** function processFees((uint256 maxBuybackAmount,uint256 minArcBotOut,uint256 minSweepBuybackTokensOut,uint256 deadline,address routeTarget,bytes routeData,bytes quoteSignature) execution) returns (uint256 gross,uint256 burned)
- **Line 118 · Text / template:** function deliverBeneficiaryAllocation(address beneficiaryAddress,address asset,uint256 amount)
- **Line 119 · Text / template:** event FeesProcessed(address indexed asset,uint256 grossClaimed,uint256 beneficiaryAllocated,uint256 buybackSpent,uint256 arcbotBurned)
- **Line 120 · Text / template:** event CurveFeesSwept(address indexed token,uint256 indexed blockNumber,uint256 minBuybackTokensOut)
- **Line 121 · Text / template:** event GraduatedFeesSwept(address indexed token,bytes32 indexed poolId,uint256 indexed blockNumber,uint256 minConversionQuoteOut,uint256 minBuybackTokensOut)
- **Line 122 · Text / template:** event BeneficiaryAllocationDelivered(address indexed beneficiary,address indexed asset,uint256 amount)
- **Line 123 · Text / template:** event BeneficiaryWithdrawal(address indexed beneficiary,address indexed asset,address indexed recipient,uint256 amount)
- **Line 124 · Text / template:** function pause()
- **Line 125 · Text / template:** function exit(address newArgusFeeRecipient)
- **Line 126 · Text / template:** function withdraw(address asset,address recipient,uint256 amount)
- **Line 127 · Text / template:** function settleAndReassign(address newController,address newBeneficiary,(uint256 maxBuybackAmount,uint256 minArcBotOut,uint256 minSweepBuybackTokensOut,uint256 deadline,address routeTarget,bytes routeData,bytes quoteSignature) execution) returns (uint256 gross,uint256 burned)
- **Line 130 · Text / template:** function deployVault(bytes32 salt,(address token,address curve,address pairAsset,address argusFactory,address feeEscrow,address arcbot,address controller,address beneficiary,address feeControl) init) returns (address vault)
- **Line 131 · Text / template:** function predictVaultAddress(bytes32 salt) view returns (address)
- **Line 132 · Text / template:** function isVault(address candidate) view returns (bool)
- **Line 133 · Text / template:** function approvedFeeEscrow(address argusFactoryAddress) view returns (address)
- **Line 134 · Text / template:** function implementation() view returns (address)
- **Line 135 · Text / template:** function feeControl() view returns (address)
- **Line 138 · Text / template:** function arcbot() view returns (address)
- **Line 141 · Text / template:** function pairRoutes(address pairAsset) view returns (uint8 kind,uint24 fee,int24 tickSpacing,address hook,bytes32 hookCodeHash)
- **Line 142 · Text / template:** function configurePairRoute(address pairAsset,uint8 kind,uint24 fee,int24 tickSpacing,address hook)
- **Line 145 · Text / template:** function processingEnabled() view returns (bool)
- **Line 145 · Text / template:** function admin() view returns (address)
- **Line 146 · Text / template:** function pauseGuardian() view returns (address)
- **Line 146 · Text / template:** function keeper() view returns (address)
- **Line 147 · Text / template:** function quoteAuthorizer() view returns (address)
- **Line 147 · Text / template:** function executionAdapter() view returns (address)
- **Line 177 · Dynamic Error:** {name} is not configured
- **Line 183 · Dynamic Error:** {name} is not a valid address
- **Line 184 · Dynamic Error:** {name} does not match the signer configuration
- **Line 200 · Error:** automated fee manual testing is disabled
- **Line 203 · Error:** manual automated fee endpoints are unavailable while automatic processing is enabled
- **Line 210 · Error:** automated fee manual-test token allowlist is missing or invalid
- **Line 226 · Error:** automated fee vault is not registered by the configured factory
- **Line 229 · Error:** token is not allowlisted for automated fee manual testing
- **Line 248 · Error:** automated fee vault token mismatch
- **Line 251 · Error:** automated fee token is missing or invalid
- **Line 270 · Error:** automated fee enrollment token is invalid
- **Line 307 · Error:** automated fee enrollment proof is invalid
- **Line 322 · Error:** asset is not in the canonical Argus pair catalog
- **Line 327 · Error:** asset has no reviewed automated fee route
- **Line 369 · Error:** RPC rejected the signed transaction
- **Line 375 · Dynamic Text / template:** arcbot-rh-{digest.slice(0, 25)}
- **Line 380 · Text / template:** Bearer
- **Line 393 · Dynamic Error:** {nameVariable} is invalid
- **Line 396 · Dynamic Error:** {expectedAddressVariable} does not match its CDP account
- **Line 419 · Error:** automated fee quote returned no output
- **Line 426 · Error:** AUTOMATED_FEE_QUOTE_SLIPPAGE_BPS must be between 50 and 1000
- **Line 437 · Error:** RPC chain mismatch
- **Line 487 · Error:** AUTOMATED_FEE_ACCUMULATION_ROUTE_UNAVAILABLE
- **Line 511 · Error:** Argus factory is not approved by the automated fee vault factory
- **Line 523 · Error:** confirmed vault deployment did not register the predicted vault
- **Line 554 · Error:** automated fee enrollment transaction reverted
- **Line 561 · Error:** automated fee enrollment live state mismatch
- **Line 688 · Error:** automated fee quote deadline is invalid
- **Line 700 · Error:** automated fee vault is not processable
- **Line 702 · Error:** automated fee quote state changed
- **Line 710 · Error:** automated fee vault no longer controls the launch
- **Line 711 · Error:** token graduation is still settling; retry this fee cycle shortly
- **Line 713 · Error:** bonding-curve automated fees require a confirmed sweep before quoting
- **Line 716 · Error:** no processable automated creator fees
- **Line 723 · Error:** canonical ARCBOT graduated pool is unavailable
- **Line 756 · Error:** paired asset has no approved automated buyback route
- **Line 759 · Error:** paired automated fee quote is below minimum output
- **Line 760 · Text / template:** uint256 minNativeOut
- **Line 764 · Error:** automated ARCBOT quote is below minimum output
- **Line 767 · Error:** automated fee quote authorizer must be an EOA
- **Line 769 · Text / template:** ArcBotFeeVault
- **Line 782 · Text / template:** ExecutionAuthorization
- **Line 822 · Error:** automated fee keeper has insufficient ETH
- **Line 870 · Error:** CREATOR_BURN_DELIVERY_OWNER_MISMATCH
- **Line 890 · Text / template:** BeneficiaryWithdrawal
- **Line 898 · Error:** AUTOMATED_FEE_DELIVERY_CLAIMABLE_MISMATCH
- **Line 922 · Error:** automated fee ARCBOT address mismatch
- **Line 929 · Error:** Argus factory and fee escrow are not an approved automated-fee stack
- **Line 935 · Error:** existing-token upgrade no longer matches Argus state or controller
- **Line 950 · Error:** automated fee admin has insufficient ETH
- **Line 961 · Error:** requested pair route does not match the reviewed route catalog
- **Line 992 · Error:** automated fee pair-route transaction envelope mismatch
- **Line 999 · Error:** automated fee pair-route calldata mismatch
- **Line 1002 · Error:** automated fee transaction hash mismatch
- **Line 1007 · Error:** CREATOR_BURN_ACTIVE_LAYER_REQUIRED
- **Line 1034 · Error:** CREATOR_BURN_REFUND_LAYER_MISMATCH
- **Line 1036 · Error:** CREATOR_BURN_LAYER_MISSING
- **Line 1049 · Error:** CREATOR_BURN_REASSIGNMENT_MISMATCH
- **Line 1053 · Text / template:** function holderRegistry() view returns(address)
- **Line 1053 · Text / template:** function distributorOf(address) view returns(address)
- **Line 1056 · Error:** CREATOR_BURN_HOLDER_RECIPIENT_MISMATCH
- **Line 1059 · Error:** CREATOR_BURN_HOLDER_EXIT_IS_ATOMIC
- **Line 1064 · Error:** CREATOR_BURN_DISABLED
- **Line 1070 · Error:** automated fee controller wallet mismatch
- **Line 1077 · Error:** Creator-fee remainder must return to the signing wallet
- **Line 1082 · Error:** automated fee withdrawal recipient must be the Argos Bot wallet
- **Line 1088 · Error:** automated fee withdrawal exceeds claimable balance
- **Line 1092 · Error:** wallet no longer controls this automated fee vault
- **Line 1096 · Error:** automated fee controller CDP mismatch
- **Line 1105 · Error:** automated fee controller has insufficient ETH
- **Line 1128 · Error:** automated fee controller transaction envelope mismatch
- **Line 1168 · Error:** CREATOR_BURN_REFUND_RECEIPT_MISMATCH
- **Line 1180 · Error:** CREATOR_BURN_REFUND_EVENT_MISSING
- **Line 1202 · Error:** automated fee controller transaction live state mismatch
- **Line 1211 · Error:** automated fee controller sweep is not applicable
- **Line 1235 · Error:** automated fee controller sweep envelope mismatch
- **Line 1238 · Error:** automated fee controller sweep calldata mismatch
- **Line 1255 · Error:** automated fee controller sweep receipt is missing its event
- **Line 1290 · Error:** automated fee signed transaction envelope mismatch
- **Line 1293 · Error:** automated fee keeper calldata mismatch
- **Line 1308 · Error:** automated fee sweep transaction envelope mismatch
- **Line 1314 · Error:** automated fee sweep calldata mismatch
- **Line 1316 · Error:** automated fee sweep transaction hash mismatch
- **Line 1331 · Error:** automated fee delivery transaction envelope mismatch
- **Line 1334 · Error:** automated fee delivery calldata mismatch
- **Line 1380 · Error:** confirmed automated fee processing receipt is missing its event
- **Line 1391 · Error:** CREATOR_BURN_DELIVERY_CONTEXT_REQUIRED
- **Line 1397 · Error:** CREATOR_BURN_CASH_NOT_DELIVERED
- **Line 1402 · Error:** confirmed automated fee delivery receipt is missing its event
- **Line 1407 · Error:** confirmed automated fee sweep receipt is missing its event
- **Line 1412 · Error:** manual vault broadcast requires its allowlisted token address
- **Line 1421 · Error:** automated fee admin transaction envelope mismatch
- **Line 1426 · Error:** automated fee admin calldata does not match its allowlisted token
- **Line 1437 · Error:** free launch sponsor account name is invalid
- **Line 1443 · Error:** free launch sponsorship is disabled
- **Line 1455 · Error:** free launch grant amount is invalid
- **Line 1457 · Error:** free launch recipient is invalid
- **Line 1470 · Error:** free launch sponsor has insufficient ETH
- **Line 1502 · Error:** free launch funding could not be broadcast
- **Line 1503 · Error:** free launch funding hash mismatch
- **Line 1523 · Error:** free launch funding transaction mismatch
- **Line 1546 · Error:** an ETH-paired developer buy must use ETH or USD
- **Line 1549 · Error:** a non-ETH developer buy must be funded in its paired asset before sponsorship
- **Line 1579 · Dynamic Text / template:** {trimDecimal(eth)} ETH
- **Line 1580 · Text / template:** ETH
- **Line 1599 · Dynamic Text / template:** {trimDecimal(amount)} {metadata.symbol}
- **Line 1605 · Error:** token lookup was not resolved by the registry
- **Line 1787 · Text / template:** ((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,uint256 minHopPriceX36,bytes hookData)
- **Line 1792 · Text / template:** address currency,uint256 minAmount
- **Line 1793 · Text / template:** address currency,uint256 maxAmount
- **Line 1794 · Text / template:** bytes actions,bytes[] params
- **Line 1826 · Error:** insufficient paired asset balance; first you need to buy the paired asset
- **Line 1835 · Text / template:** PermitDetails
- **Line 1837 · Text / template:** PermitSingle
- **Line 1840 · Text / template:** ((address token,uint160 amount,uint48 expiration,uint48 nonce) details,address spender,uint256 sigDeadline) permit,bytes signature
- **Line 1857 · Error:** quote returned no output
- **Line 1974 · Dynamic Text / template:** via_usdg={Math.max(0, uniqueCandidates.length - direct)}
- **Line 1975 · Dynamic Text / template:** failures={Object.entries(failures).sort().map(([reason, count]) => \`${reason}:${count}\`).join(",") || "none"}
- **Line 1994 · Dynamic Text / template:** {error.name} {error.message}
- **Line 2005 · Error:** token quantity must be positive
- **Line 2009 · Error:** token quantity quote returned no output
- **Line 2013 · Error:** could not quote the requested token quantity
- **Line 2030 · Error:** invalid token valuation route
- **Line 2038 · Text / template:** function getReserves() view returns(uint256,uint256)
- **Line 2038 · Text / template:** function feeBps() view returns(uint256)
- **Line 2043 · Error:** invalid bonding curve valuation
- **Line 2047 · Error:** this Argus token is still finalizing its Uniswap V4 pool
- **Line 2048 · Error:** V4 valuation quoter is missing
- **Line 2053 · Error:** no usable token valuation route
- **Line 2077 · Error:** unsupported token amount unit
- **Line 2093 · Error:** USD sell amount resolved to zero tokens
- **Line 2123 · Error:** ETH transfer amount plus gas exceeds wallet balance
- **Line 2125 · Error:** ETH transfer amount resolves to zero after reserving gas
- **Line 2133 · Error:** wallet owner mismatch
- **Line 2134 · Error:** LP_RPC_BEHIND_CONFIRMED_STEP
- **Line 2162 · Status / notice:** transaction total cost (gas * gas fee + value) exceeds the balance
- **Line 2231 · Error:** purchase-time token value is unavailable
- **Line 2233 · Error:** purchase-time token value is invalid
- **Line 2294 · Dynamic Text / template:** 0x{createHmac("sha256", required("WALLET_SIGNER_IDEMPOTENCY_SECRET")) .update(\`argus-launch:${request.idempotencyKey}\`).digest("hex")}
- **Line 2330 · Error:** persisted Argus prediction is invalid
- **Line 2342 · Error:** launch operation required
- **Line 2388 · Error:** CREATOR_FEE_LOOKUP_INCOMPLETE
- **Line 2403 · Error:** no completed Argus launch was found for that token
- **Line 2427 · Error:** creator fee valuation unavailable; try again shortly
- **Line 2460 · Dynamic Status / notice:** [launch_cost_estimate_wei={BigInt(match[1]) + launchFee}]
- **Line 2502 · Error:** Argus expected launch address did not match the saved prediction
- **Line 2511 · Error:** initial launch buy amount is missing
- **Line 2518 · Error:** a non-ETH developer buy must use USD or an amount of the paired asset
- **Line 2527 · Error:** paired asset approval is required before estimating launch sponsorship
- **Line 2586 · Error:** estimated free launch grant is outside the permitted range
- **Line 2600 · Error:** free launch funding estimate requires a launch operation
- **Line 2609 · Status / notice:** token
- **Line 2621 · Error:** burn destination policy rejected the request
- **Line 2636 · Error:** token amount resolved to zero
- **Line 2638 · Error:** insufficient token balance
- **Line 2650 · Error:** this Argus token is paired with ETH; specify an ETH or dollar amount
- **Line 2651 · Error:** this Argus token buys with its paired asset; specify a dollar amount or an amount of the paired asset
- **Line 2653 · Error:** the named paired asset does not match this Argus token's actual pair
- **Line 2703 · Error:** paired-asset amounts are only supported for Argus tokens
- **Line 2752 · Error:** insufficient token balance for the requested sell amount
- **Line 2799 · Error:** holder fee distributor already exists
- **Line 2806 · Error:** wallet is not the current creator fee recipient
- **Line 2826 · Error:** no claimable creator fees are available in ETH
- **Line 2830 · Error:** no claimable creator fees meet the $1 minimum
- **Line 2836 · Error:** no claimable creator fees are available in the paired asset
- **Line 2850 · Error:** wallet is not the launch creator fee beneficiary
- **Line 2853 · Error:** nothing to sweep
- **Line 2858 · Error:** unsupported signer operation
- **Line 2867 · Error:** signed transaction sender mismatch
- **Line 2868 · Error:** signed transaction chain mismatch
- **Line 2869 · Error:** signed transaction destination mismatch
- **Line 2870 · Error:** signed transaction value mismatch
- **Line 2872 · Error:** signed transaction hash mismatch
- **Line 2901 · Text / template:** transaction total cost (gas * gas fee + value) exceeds the balance
- **Line 2903 · Text / template:** RPC rejected the signed transaction parameters
- **Line 2904 · Text / template:** RPC could not broadcast the signed transaction
- **Line 2907 · Error:** RPC returned a mismatched transaction hash
- **Line 2919 · Error:** on-chain transaction sender mismatch
- **Line 2920 · Error:** on-chain transaction destination mismatch
- **Line 2921 · Error:** on-chain transaction value mismatch
- **Line 2939 · Error:** expected Argus factory is missing from receipt verification
- **Line 2947 · Error:** launch deployer mismatch
- **Line 2961 · Error:** opening developer buy event mismatch
- **Line 2964 · Error:** opening developer buy launch mismatch
- **Line 2972 · Error:** verified Argus launch event was not found
- **Line 2973 · Error:** verified opening developer buy event was not found
- **Line 2981 · Dynamic Text / template:** {trimDecimal(formatUnits(openingBuy.amount, metadata.decimals))} {metadata.symbol}
- **Line 2993 · Error:** launch creator fee recipient mismatch
- **Line 3004 · Error:** creator fee claim event mismatch
- **Line 3005 · Dynamic Text / template:** {trimDecimal(formatEther(decoded.args.amount))} ETH
- **Line 3010 · Dynamic Text / template:** {trimDecimal(formatUnits(decoded.args.amount, metadata.decimals))} {metadata.symbol}
- **Line 3016 · Error:** verified creator fee claim event was not found
- **Line 3020 · Error:** creator fee reassignment expectations were missing
- **Line 3033 · Error:** creator fee reassignment event mismatch
- **Line 3040 · Error:** creator fee reassignment post-state mismatch
- **Line 3047 · Error:** verified creator fee reassignment event was not found
- **Line 3073 · Error:** confirmed burn amount could not be verified
- **Line 3074 · Error:** confirmed trade output could not be verified
- **Line 3075 · Dynamic Text / template:** {trimDecimal(formatUnits(verifiedAmount, decimals))} {symbol}

### lib/web-wallet-session.ts

- **Line 39 · Dynamic Text / template:** {payload}.{signature(payload, secret)}
