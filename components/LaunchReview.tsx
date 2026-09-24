import { launchImageSource } from "../lib/launches/image";
import { LAUNCH_EXECUTION_ENABLED } from "@/lib/launches/policy";
import { formatUnits } from "viem";
import { displayUsdc } from "@/lib/amount-display";
import { allocationSummary } from "@/lib/launches/form";
import type { LaunchInput } from "@/lib/launches/input";
import type { LaunchPreview } from "@/lib/launches/prepare";
import { ExternalTokenImage } from "./ExternalTokenImage";
import styles from "./LaunchPreparation.module.css";
import { LAUNCH_PORTAL } from '../lib/launches/contracts';

export function LaunchReview({ input, wallet, walletLabel, preview, expired = false }: {
  input: LaunchInput; wallet: string; walletLabel: string; preview: LaunchPreview | null; expired?: boolean;
}) {
  const legacy=preview?.portal?.toLowerCase()===LAUNCH_PORTAL.toLowerCase();
  return <section className={styles.panel} aria-label="Launch review">
    <h2>Review token</h2>
    <div className={styles.token}>
      <ExternalTokenImage src={launchImageSource(input.imageURI)} name={input.name} />
      <div><h3>{input.name}</h3><span>{input.symbol}</span></div>
    </div>
    {input.description && <p className={styles.prose}>{input.description}</p>}
    <div className={styles.links}>{[["Website", input.website], ["X", input.twitter], ["Telegram", input.telegram]].map(([label, url]) =>
      url ? <a key={label} href={url} target="_blank" rel="noopener noreferrer">{label}</a> : null)}</div>
    <dl className={styles.facts}>
      <div><dt>Paired asset</dt><dd>{input.pairToken}</dd></div>
      <div><dt>Reward currency</dt><dd>{input.pairToken}</dd></div>
      <div><dt>Buy tax</dt><dd>1%</dd></div><div><dt>Sell tax</dt><dd>1%</dd></div>
      <div><dt>Supply</dt><dd>1,000,000,000 {input.symbol}</dd></div>
      <div><dt>Initial creator buy</dt><dd>{input.pairToken==="USDC"?`${displayUsdc(input.devBuyUSDC)} USDC`:preview?.quote?`${formatUnits(BigInt(preview.quote.devBuy),preview.quote.decimals)} ${input.pairToken} (${displayUsdc(input.devBuyUSDC)} USD reference)`: `${displayUsdc(input.devBuyUSDC)} USD value in ${input.pairToken}`}</dd></div>
      {input.dividendBps > 0 && <div><dt>Dividend eligibility</dt><dd>{legacy?`100,000 ${input.symbol}`:'Eligible circulating holders'}</dd></div>}
    </dl>
    <p className={styles.hint}>Maximum total setup and launch gas: 0.5 USDC.</p>
    <h3>Fee allocation</h3>
    <dl className={styles.facts}>{allocationSummary(input).map(row =>
      <div key={row.label}><dt>{row.label}</dt><dd>{row.percent}</dd></div>)}</dl>
    <p className={styles.hint}>Allocation divides the proceeds after Argus Pad’s share.</p>
    <p className={styles.hint}>{walletLabel}. {input.feeDestination?'This wallet funds the launch.':'Creator rewards go to this wallet.'}</p>
    <a className={styles.address} href={`https://www.arcexplorer.org/address/${wallet}`} target="_blank" rel="noopener noreferrer">{wallet}</a>
    {input.feeDestination && <><p className={styles.hint}>Creator fee recipient: {input.feeDestination.recipient}{input.feeDestination.platform==='github'?'. Fees go to the identity vault; withdrawal requires GitHub verification.':'.'}</p><a className={styles.address} href={`https://www.arcexplorer.org/address/${input.feeDestination.address}`} target="_blank" rel="noopener noreferrer">{input.feeDestination.address}</a></>}
    {preview ? <div className={styles.simulation}>
      <h3>{preview.status === "simulated" ? "Simulation passed" : "Setup required"}</h3>
      <dl className={styles.facts}>
        <div><dt>Spendable Arc USDC at check</dt><dd>{displayUsdc(formatUnits(BigInt(preview.availableWei), 18))}</dd></div>
        <div><dt>Gas allowance</dt><dd>{preview.gasWei === null ? "Pending setup simulation" : `${formatUnits(BigInt(preview.gasWei), 18)} USDC`}</dd></div>
        <div><dt>Total funding required</dt><dd>{preview.requiredWei === null ? "Pending setup simulation" : `${formatUnits(BigInt(preview.requiredWei), 18)} USDC`}</dd></div>
        {preview.status === "needs_setup" && preview.setupFundingWei && <div><dt>USDC needed before setup</dt><dd>{formatUnits(BigInt(preview.setupFundingWei),18)} USDC</dd></div>}
      </dl>
      <ol>{preview.steps.map(step => <li key={step.kind}>
        {step.kind === "rewards" ? "Configure holder rewards" : step.kind === "approval" ? `Approve creator-buy ${input.pairToken}` : "Create token and pool"}
      </li>)}</ol>
      {preview.status === "needs_setup" && <p>Setup calls were checked. The launch still needs simulation after setup.</p>}
      {preview.status === "needs_setup" && preview.setupFundingWei && <p className={styles.hint}>Includes a launch gas buffer. Only actual transaction fees are spent.</p>}
      {legacy?<><p className={styles.hint}>Predicted token address</p><code className={styles.address}>{preview.predictedToken}</code>
      <p className={styles.hint}>No token has been deployed at this predicted address by this preparation.</p></>:<p className={styles.hint}>The token address will be verified from the completed launch receipt.</p>}
    </div> : <p className={styles.hint}>{expired ? "Simulation expired. Prepare again for current network checks." : "Save and prepare to check funding and simulate."}</p>}
    {input.devBuyUSDC !== "0" && <p className={styles.hint}>{legacy?'The creator buy is price-limited. Any unspent amount is refunded by the launch contract.':'The opening buy spends the specified amount. The launch reverts if it would cross the bonding threshold.'}</p>}
    <p className={styles.hint}>{LAUNCH_EXECUTION_ENABLED
      ? "Confirm launch authorizes the setup transactions and token deployment shown here. Preparation alone does not send transactions."
      : "Preparation only. No transaction will be signed or sent."}</p>
  </section>;
}
