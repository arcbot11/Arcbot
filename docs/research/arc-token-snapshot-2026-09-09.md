# Arc mainnet token snapshot — 9 September 2026

**100 ranked tokens and all 24 tokens from the four documented Argus portals.** Chain ID: 5042. Market data retrieved around 20:57–20:59 UTC (17:57–17:59 Halifax). Argus contract enumeration and metadata pinned to block 20,028,234.

## Scope and ranking

This is the top 100 by available source-reported market-cap estimate, not a definitive census of every Arc asset. The explorer returned 709 pool rows, yielding 624 unique tokens with positive USD-anchored caps. Adding missing Argus tokens and native USDC produced 647 rankable tokens. Unpriced assets are not treated as zero or ranked from their ticker alone; for example, the explorer reported no USD market cap for Animus USD (AUSD).

For tokens with multiple pools, use the pool with the greatest reported USD liquidity, not the pool advertising the largest cap. No minimum liquidity filter is applied. **† means less than $100 of reported pool liquidity**, so the cap can be dominated by a tiny trade. A dash means liquidity was unavailable, not zero. Market caps are rounded to whole dollars.

Explorer caps estimate circulating supply; Argus caps are pool price × total supply. The combined ranking is therefore indicative, not a standardized circulating-cap ranking. The explorer exposed V2/V3 markets; Argus adds its known V4 launches. Other unindexed markets may be missing. Separate requests can reflect slightly different blocks. USDC is included at the explorer's $1 valuation.

Sources: [Explorer market API](https://www.arcexplorer.org/api/v1/dex/pools?limit=100&offset=0&sort=marketCap&order=desc), [USDC detail](https://www.arcexplorer.org/api/v1/tokens/0x3600000000000000000000000000000000000000), [Argus board](https://arguspad.io/), [Argus integration documentation](https://arguspad.io/docs). Argus names and symbols were read from the token contracts through its public RPC. The older Argus /tokens page was not used for current rankings because its displayed block was substantially behind the live explorer.

## Top 100 by estimated market cap

| Rank | Ticker | Name | Est. MCAP (USD) | Pool liquidity (USD) | Contract address | Argus |
|---:|---|---|---:|---:|---|:---:|
| 1 | USDC | USDC | $8,373,142 | — | `0x3600000000000000000000000000000000000000` |  |
| 2 | TOLLY | Tolly | $2,807,665 | $228,981 | `0xbc43ce8dec648ea298c4275559b81d6261c90b67` |  |
| 3 | COOL | usdc is cool | $2,803,042 | $235,891 | `0xeb64987643db71c76b2a2be7e723decc995e5b37` |  |
| 4 | TNEW | tnew | $1,508,383 | $17 † | `0x2aa24a6311766eb0457313246be769f4877960d4` |  |
| 5 | Architects | Architects | $1,052,003 | $107,743 | `0x8bcb94279fc2c984ec34e0c1f2192df8c69ea4f0` |  |
| 6 | ARCAT | ARCAT | $690,442 | $101,271 | `0x07704b06981ea962b87296362a1281484d160000` |  |
| 7 | WARP | WARP | $671,807 | $75,882 | `0x384c60f98ecd4c26345499345c03d677e40f115e` |  |
| 8 | ARGUS | Argus | $514,922 | $86,564 | `0xece5ca8bf9220718e5727754026757512212cb3c` | Yes |
| 9 | ARCASH | ARCASH | $397,531 | $62,765 | `0x0bffa97f774824e9da843699aedd2835cb1b8022` | Yes |
| 10 | EURC | EURC | $392,484 | $9 † | `0xbef5f6d51cb62b58e6a8f77868681825c6fe21c1` |  |
| 11 | STEVE | STEVE | $369,894 | $78,391 | `0xa23632d6a32174ff4ee8e76aacf9f244e10cfd73` |  |
| 12 | USDC | FatCatBatRatWifHat | $365,233 | $64,827 | `0x0006ed5d37a9d6687d1ecc8b642ff9c4760d9a16` |  |
| 13 | BEANCAT | Bean Cat | $298,868 | $51,026 | `0x41c8a71f630c636294009fa4fb0cc4c3bbe674fe` |  |
| 14 | CRCL | Just a Circle | $227,971 | $48,005 | `0xd40ed72054bce37d2284bb315ffca122b690dc4b` |  |
| 15 | DEPLOY | Deploy Dollars | $156,847 | $36,227 | `0x6719768b632d1aeb7e3126278ca29db48c3546ba` |  |
| 16 | SHARCFUN | Sharc Fun | $132,989 | $15,121 | `0x99b37b7fccaa7a1030617b6195eb3045c523bb97` |  |
| 17 | ARCANINE | Arcanine | $132,124 | $43,857 | `0xf3715bf5c2de299f08b81180ffb739a8372a175f` |  |
| 18 | EVE | eve | $127,755 | $41,088 | `0x19209e55049bc613c5cc8b66b7df7824096e78cf` |  |
| 19 | BULL | USDC Bull | $123,346 | $32,846 | `0x4cc878731ae13276c72455663a83dc985d953553` |  |
| 20 | BANCOR | BANCOR | $107,394 | $37,022 | `0xc55a4468a3e1c2dfe58dddad0188c71d5dffd740` |  |
| 21 | SLJ | Supreme Leader Jeremy | $102,470 | $30,341 | `0x127f80844ff3d672410ce4b6f4f9ea1a8d6a7ae6` |  |
| 22 | BUILDOG | BUILDOG | $91,624 | $33,090 | `0x4cb8382b9daf7992d3b27d32f7db650c57881daa` |  |
| 23 | 豆 | 豆 | $89,026 | $27,726 | `0x802d3166ad677d3aa993c85910598885568099bf` |  |
| 24 | ARCBAT | ARC BAT | $79,778 | $25,872 | `0xbe0cad585ea2d13de2f4e36376be755c0afd8b97` |  |
| 25 | KAIRO | Kairo | $78,437 | $30,296 | `0x3ead4e80e9e5bc0e01682d7ee74c4881b040d3ea` |  |
| 26 | WORM | WORM | $77,563 | $15,191 | `0x5b1e512d9b8bb0b16dc7550b70ec4f21fdbc359a` |  |
| 27 | AROS | Aros | $59,139 | $20,897 | `0x313c87e367791fe16ae97754554f4871bfe7fcb6` |  |
| 28 | peg | peg | $59,120 | $20,061 | `0x2bfe315f219cc9fdc9ce0266e6c115927f0e4c10` |  |
| 29 | JOROMY | Joromy Alloiru | $59,004 | $21,879 | `0x5c39079daa36265dfdbb52739ee35eb11727efe1` |  |
| 30 | SWIRLY | Swirly | $53,326 | $23,018 | `0xc47278d6d8bdb2426fc7f209922500d1414494ed` |  |
| 31 | ARCH | Archemist | $52,447 | $22,570 | `0x5042419b1f2498959787bc23be1f484ed1306650` |  |
| 32 | USDCBULL | The Blue USDC Bull | $51,841 | $22,506 | `0xbf5f829f19414dc1019e2797aa78cc950c25ec3e` |  |
| 33 | NOAH | Noah's Arc | $51,393 | $22,408 | `0x1ed9306725b8b4ca1a1a56d32970e49e64c51dde` |  |
| 34 | USDC | UpSide Down Cat | $48,666 | $20,246 | `0x7b504d734ffb55be30ba8fc66d45c1f50decbd2b` |  |
| 35 | Builders | Builders | $48,034 | $18,598 | `0xa37c1f9b2483b3b45ced74b10e19223aa76d18f2` |  |
| 36 | USDUC | Unstable Coin | $46,718 | $18,595 | `0xe816fe58b7e64f2fcde14a74835b65247fc66f7e` |  |
| 37 | TENDREN | Project Tendren | $43,731 | $17,271 | `0xe8519c472fba2a0f81e756aa5240f9d2ba152183` |  |
| 38 | SHARC | Sharc | $42,792 | $19,601 | `0xf2627e7566d01f6c8ff2892f4a802fee6d2898af` |  |
| 39 | USDC | Upside Down Cat | $40,401 | $16,617 | `0x1f649d788b1b57d4d7ec042bc7c8ae09bdac1b4c` |  |
| 40 | CUSP | CUSP | $35,791 | $16,704 | `0xc86869db9c94e27b7a23b5bfee00831e9a626943` |  |
| 41 | SPATIAL | SpatialOS | $34,273 | $16,368 | `0xf77aec0f5ea8c23e69396515aa76521a57addad5` |  |
| 42 | ARCMAN | ARCMAN | $33,646 | $16,158 | `0xe15b0e8db7411e55f13ca67347ce2c1c413cba7d` |  |
| 43 | BRC | BaraCat | $32,438 | $14,446 | `0x11c87c506acf3ea0799f8717127fe55a184f8efd` |  |
| 44 | CHELSEA | Chelsea | $32,057 | $14,060 | `0xc98fda9251fea581beef6e15eb975306bbe7e380` |  |
| 45 | SASHIMI | sashimi | $32,023 | $14,543 | `0x4021807892cf9ac94b01f3a71176d4aaf5007cd8` |  |
| 46 | 1USDC | Just buy 1 usdc | $30,519 | $13,270 | `0x3cf48ebdab8851c2fdd0d62e0585f857be45efbd` |  |
| 47 | Arc House | Arc House | $28,362 | $13,157 | `0x1fa496cca20d1249972bee850bb3fc612f808cab` |  |
| 48 | 5042 | 5042 | $27,281 | $12,391 | `0x19b94c2037b89a002ff4a445618d26b8ed9ffebc` |  |
| 49 | SPARK | Project Spark | $26,639 | $12,089 | `0x1570489708c328aa51ba8004c95a60e6f9f757e3` |  |
| 50 | TEST_INSTANT | TEST_INSTANT | $25,011 | $18 † | `0xbdc64b5a94097dca0d8c3964f9522d258f014eca` |  |
| 51 | Test | Test | $23,457 | $12,616 | `0x888a013e4655379e02c7e46d684316c457c00000` |  |
| 52 | Birdie | Chris Ries dog | $23,179 | $10,698 | `0x8e604ae97dda3deb77d9856606a8dc3135998fc4` |  |
| 53 | Aros | Aros | $22,853 | $11,592 | `0xb65295e3cee4619290b1722f625a73d523b84b16` |  |
| 54 | MALA | Malachite | $22,780 | $10,552 | `0x4f7dc89dc44ad08c20d9680d2ee9cfad69bfda55` |  |
| 55 | NIPS | Sir Nips A Lot | $22,221 | $10,386 | `0x099c3fe7dfea6aebcf9cde9ff9bdec3d843418ab` |  |
| 56 | Aros | Circle Dog | $20,733 | $20,635 | `0x3af1d499cb46cd5504a5a3cb864dcc105b74470d` |  |
| 57 | COOL | usdc.cool | $20,593 | $10,284 | `0xacd3c4ae00ddac5cd857d83424cf4eb85f32ad8f` |  |
| 58 | pegcoin | pegcoin | $18,499 | $9,151 | `0x33f245ca756c43d793a27e401ad44e56163cf844` |  |
| 59 | 5042 | 5042 | $18,335 | $9,991 | `0xc2e7d8a989cbbc5a7c9190b30f24c12c24254b63` |  |
| 60 | GARC | gArc | $18,285 | — | `0x6B5092e9A813c462b0E33e1f2050Fb60D9ffd271` | Yes |
| 61 | ARK | Noah's Ark | $16,641 | — | `0xb1020dad13212C38eE4D329A4bd5bDbC3e653f89` | Yes |
| 62 | FUEL | FUEL | $16,205 | $8,057 | `0xeacf05f446be4032b52dd6549a7cc45c8a8e9902` |  |
| 63 | USD//C | USD//COIN | $15,524 | $7,887 | `0x6c99da01ef3221d4c3834ad086fc0b024e513d76` |  |
| 64 | DAGG | dagg.fun | $15,505 | $7,738 | `0x86b93ea0efcdc8405421b70185ea9cfb15d24bb0` |  |
| 65 | ARCHITECTS | Architects | $15,231 | $8,114 | `0xc6d6f1fc29acd081e94909ea60e2307339e551e0` |  |
| 66 | EconomicOS | THE ECONOMIC OS  FOR THE INTERNET | $15,085 | $7,602 | `0x3f380813cb5045ff5b052583176ffa716e5cfec6` |  |
| 67 | BULL | ArcBull | $14,114 | $7,602 | `0xe40c6243a13e49aa3f0a2ab6d3d8e740539d6d8a` |  |
| 68 | Reflection | Reflection | $13,911 | $6,596 | `0x3f601e8a9854f562b14fe89a5b18977631025726` |  |
| 69 | BOA | Build On Arc | $13,419 | $7,215 | `0xd065b4f302a2154745c844c424ec08d3d1c62fdf` |  |
| 70 | ECOOL | eurc.cool | $12,459 | $5,970 | `0x935cdfd477bc1fd6346ea99c75ff6e71d8ce2698` |  |
| 71 | Dyor | DyorSwap | $12,313 | $3,103 | `0xc7b7390c475b80f7a9921ca31025f4cd872d0f9f` |  |
| 72 | POTATO | Potato | $11,894 | — | `0x333a07961b50924056B15477b409a9Ae774e1Ed7` | Yes |
| 73 | C | Look for the C | $11,420 | $5,843 | `0xe0e3a6a636ece8b21c243df9f658391d57f23a34` |  |
| 74 | BARKETS | BARKET | $11,395 | $5,060 | `0xc6d44a055b64b04a7800a4e896a8d6ebc6b2af6f` |  |
| 75 | VORT | VORT | $11,267 | $4,794 | `0x1d46179686ba8a473477317629674c566c66249b` |  |
| 76 | HAT | ARC HAT | $11,195 | $4,794 | `0xbdf7b8a2c905b8f0d7385e9f443aff7f296caaee` |  |
| 77 | USDC | FatCatBatRatWifHat | $11,185 | $5,709 | `0xff328d0e2b9898189bde4b671d1729cefe13e87b` |  |
| 78 | Forrest | Forrest | $11,004 | $5,681 | `0x96cf6e8ab5141080ae7ae1d61ef728a8a8eee619` |  |
| 79 | MINARA | Minara AI | $10,975 | $4,857 | `0xd72caf1209b17fed2368ea0903abc1b65b0ba6e7` |  |
| 80 | DYSON | Dyson Toothbrush | $10,760 | $4,544 | `0xe28a59358702d03408d9f6917f7307da847f25f5` |  |
| 81 | LOCK | WeGoLock | $10,426 | — | `0x7c21679715476d5e6d64be0Cf868e21787F35e29` | Yes |
| 82 | ARCT | ArcTools | $10,399 | $4,363 | `0x1ea1e4f9a9975f1f6e9c0a9f6e8ada7a66e6de52` |  |
| 83 | CRCL | Just a Circle | $10,202 | $5,413 | `0x135d05f7c5aa1a2f1e52512776b7bdfb563e3b4d` |  |
| 84 | $COOL | usdc.cool | $10,173 | $4,224 | `0x5392ed2bc20cdeee1db3b7bee3f9c4e66af994a5` |  |
| 85 | Birdie | ChriesRiesDog | $10,012 | $3,715 | `0xa290731b7b6247e2b4e397092bdddb03c6f20000` |  |
| 86 | NULL | null | $9,999 | $0 † | `0xdb6dfcec96e735c418a9088d318bfc0761783799` |  |
| 87 | PONIE | Pons meet UNI liquidity | $9,999 | $0 † | `0xc360ed44564da8632b0e96d079c6763df73b0d01` |  |
| 88 | ADog | Arcdog | $9,956 | $3,775 | `0x626f6b18b02ce1b9d569e4d7f9b74df600300000` |  |
| 89 | SASHIMI | USDCHedgehogMascot | $9,689 | $3,805 | `0x7a575c9acfdc723601db79d30bbba3cb7d76237e` |  |
| 90 | ORIGIN | ArcOrigin | $9,319 | $3,657 | `0xce9c0e29f8d5904bfac3c8a79a0c9af00e6bdccb` |  |
| 91 | TEST | test | $9,265 | $3,697 | `0x891406ac300c330a58a2adde58d46673f32d3521` |  |
| 92 | BRRR | Money Printer | $9,209 | $3,506 | `0x483e3e6b962b081bbf54ee2b6ecab012a21112f0` |  |
| 93 | NIPS | Circle cat | $9,171 | $3,451 | `0x7c620c2c91902e0d949deaecc27e988cf8b03dbe` |  |
| 94 | STEVE | Steve | $9,065 | $4,596 | `0x8f7e94eae6fb5b69b08536dd5737268799fdae9d` |  |
| 95 | ARCMAN | ARCMAN | $9,023 | $5 † | `0xb1d1616b07f8349e47b959c66daa55f3892f1d32` |  |
| 96 | HEATER | HEATER | $9,020 | $4 † | `0x4fcc1af86f7105e92de2ae92d881966e7a36a5a4` |  |
| 97 | NIPS | Sir Nips A Lot | $9,018 | $2,884 | `0x4aa51b9a4877d321f01b9cf3140fc48c91060000` |  |
| 98 | AAPE | ArcApe | $9,016 | $0 † | `0x5640231b2ac4d1c0a9ef430764cfce41a40b4110` |  |
| 99 | STILLPAY | Still Paying | $9,016 | $0 † | `0x1aa8f972e9b2d2766d7b0b876acae87b88dcf7f1` |  |
| 100 | COOL | usdc.cool | $9,000 | $2,976 | `0x247c25617b49a5e5ea5f3074c3dc918ed86d0000` |  |

## Every token from the documented Argus portals

All 24 on-chain addresses match the 24-token board. Current V4 portal: 21 tokens; previous V4 portal: 1; each of the two V3 portals: 1. Duplicate tickers are separate contracts and are preserved. Caps in this table use Argus's own board values, so overlapping entries may differ from the explorer-based ranking above.

| # | Ticker | Name | Argus est. MCAP (USD) | Contract address | Portal generation |
|---:|---|---|---:|---|---|
| 1 | ARGUS | Argus | $522,924 | `0xeCe5cA8bf9220718E5727754026757512212cb3c` | legacy-v3 |
| 2 | ARCASH | ARCASH | $397,341 | `0x0BFFa97f774824e9dA843699aEDd2835cb1b8022` | legacy-v3 |
| 3 | GARC | gArc | $18,285 | `0x6B5092e9A813c462b0E33e1f2050Fb60D9ffd271` | hooked-v4 |
| 4 | ARK | Noah's Ark | $16,641 | `0xb1020dad13212C38eE4D329A4bd5bDbC3e653f89` | hooked-v4 |
| 5 | POTATO | Potato | $11,894 | `0x333a07961b50924056B15477b409a9Ae774e1Ed7` | hooked-v4 |
| 6 | LOCK | WeGoLock | $10,426 | `0x7c21679715476d5e6d64be0Cf868e21787F35e29` | hooked-v4 |
| 7 | 豆 | Bean | $5,694 | `0x61bbAcb4cA341E9676F1Dc574588553517a0a500` | hooked-v4 |
| 8 | ARCHITECTS | Architects | $4,037 | `0x67b7fB9C33A8e67D5b5c1dBc028f5277c77b792B` | hooked-v4 |
| 9 | JOAN | Joan of Arc | $2,983 | `0x247D016816e4CCBb2f7C4D510843c6a3B1dD8Ef7` | hooked-v4 |
| 10 | 5042 | 5042 | $2,600 | `0x65BFf4F90Fb928Dfb6f95c0A56B9Ebebf1Fa93e4` | hooked-v4 |
| 11 | CURVE | Curve | $2,570 | `0xA4824D1927ccC6B562a2d3BD5f7FBeC4ca045629` | hooked-v4 |
| 12 | ARCADIA | Arcadia | $2,517 | `0x62249DD3F1f359607408D4A3682F2f3bcEa09f2E` | hooked-v4 |
| 13 | CFA | Circle For Agents | $2,502 | `0xbcc9AB98a333C4A6f0a269f9e0814301FC57bf70` | hooked-v4 |
| 14 | DIVIDENDS | Dividends | $2,492 | `0xdB0F22a5B551C4027488007522Ed0FaAF27cB299` | hooked-v4 |
| 15 | ROOM | the bored room | $2,485 | `0x240f01C83CAb30f0e1083B4EF77F9a0369094A0d` | hooked-v4 |
| 16 | SQUIRREL | gDogSquirrel | $2,484 | `0x5aA5BB5f5c9899D361d27Fb0cDDAEB39Ac4C452D` | hooked-v4 |
| 17 | JERRY | Dollar Jerry | $2,483 | `0x34f80AbB8422c4d86a854dDa16194d34338Bc000` | hooked-v4 |
| 18 | BARC | Barc | $2,483 | `0x399bb88d5E663cCB172fb1007eAC22395D212786` | hooked-v4 |
| 19 | 5042 | THE CHAIN ID | $2,482 | `0x2a2DB992254EE6A198560439C545518F33a0a718` | hooked-v4 |
| 20 | MOONG | Moong Dog | $2,482 | `0xE8580313fab1Fee4a66Dff8B2836EE0b4c05f857` | hooked-v4 |
| 21 | CASH | Cash Coin | $2,482 | `0xdCEFd155724b1Bd750D5C16Eb634FDd04394274e` | hooked-v4 |
| 22 | RADIUS | No Radius, No Circle. | $2,482 | `0xb259423e644e9E976D20D1075Dcc0e84dCf0Fe36` | hooked-v4 |
| 23 | ROUNDED | roundED | $2,481 | `0x1B86283EEEb38a3D79e24278b761351EB293Dfa7` | hooked-v4 |
| 24 | ELIZABAO | elizaBAO | $2,481 | `0xf873A377Bb288b3dE344b5bBF5e9A2e365f9FB06` | hooked-v4 |

## Portal verification

Read `eth_chainId` = `0x13b2` (5042). Read `getTokens(0, 1000)` on each portal at the same block. Every result contained fewer than 1000 entries; combined set matched the board exactly. Read `name()`, `symbol()`, `decimals()` and `totalSupply()` for each returned token at that block.

| Portal | Generation | Tokens |
|---|---|---:|
| `0xa36c443a797771df82533b8b4a86f0affd970862` | hooked-v4 | 21 |
| `0x7a17ab0106c46c0be30623f3eb7f299cc0058338` | hooked-v4 | 1 |
| `0xbed9880a0ba12722ba4b8791c0b6f8c74338246c` | legacy-v3 | 1 |
| `0x0f1c7cb26d6cd36bd4189e41947658b39437587a` | legacy-v3 | 1 |

The accompanying JSON retains exact numerical estimates, source URLs, pricing pool addresses, portal addresses and verification block. This is a research snapshot; no token registry or trading configuration was changed.
