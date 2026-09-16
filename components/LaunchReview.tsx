import { launchImageSource } from "../lib/launches/image";
import { LAUNCH_EXECUTION_ENABLED } from "@/lib/launches/policy";
import { formatUnits } from "viem";
import { displayUsdc } from "@/lib/amount-display";
import { allocationSummary } from "@/lib/launches/form";
import type { LaunchInput } from "@/lib/launches/input";
import type { LaunchPreview } from "@/lib/launches/prepare";
import { ExternalTokenImage } from "./ExternalTokenImage";
import styles from "./LaunchPreparation.module.css";

export function LaunchReview({ input, wallet, walletLabel, preview, expired = false }: {
  input: LaunchInput; wallet: string; walletLabel: string; preview: LaunchPreview | null; expired?: boolean;
}) {
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
      {input.dividendBps > 0 && <div><dt>Minimum for dividends</dt><dd>100,000 {input.symbol}</dd></div>}
    </dl>
    <p className={styles.hint}>Maximum total setup and launch gas: 0.5 USDC.</p>
    <h3>Fee allocation</h3>
    <dl className={styles.facts}>{allocationSummary(input).map(row =>
      <div key={row.label}><dt>{row.label}</dt><dd>{row.percent}</dd></div>)}</dl>
    <p className={styles.hint}>Allocation divides the proceeds after Argus Pad’s share.</p>
    <p className={styles.hint}>{walletLabel}. Creator rewards go to this wallet.</p>
    <a className={styles.address} href={`https://www.arcexplorer.org/address/${wallet}`} target="_blank" rel="noopener noreferrer">{wallet}</a>
    {preview ? <div className={styles.simulation}>
      <h3>{preview.status === "simulated" ? "Simulation passed" : "Setup required"}</h3>
      <dl className={styles.facts}>
        <div><dt>Spendable Arc USDC at check</dt><dd>{displayUsdc(formatUnits(BigInt(preview.availableWei), 18))}</dd></div>
        <div><dt>Gas allowance</dt><dd>{preview.gasWei === null ? "Pending setup simulation" : `${formatUnits(BigInt(preview.gasWei), 18)} USDC`}</dd></div>
        <div><dt>Total funding required</dt><dd>{preview.requiredWei === null ? "Pending setup simulation" : `${formatUnits(BigInt(preview.requiredWei), 18)} USDC`}</dd></div>
      </dl>
      <ol>{preview.steps.map(step => <li key={step.kind}>
        {step.kind === "rewards" ? "Configure holder rewards" : step.kind === "approval" ? `Approve creator-buy ${input.pairToken}` : "Create token and pool"}
      </li>)}</ol>
      {preview.status === "needs_setup" && <p>Setup calls were checked. The launch still needs simulation after setup.</p>}
      <p className={styles.hint}>Predicted token address</p><code className={styles.address}>{preview.predictedToken}</code>
      <p className={styles.hint}>No token has been deployed at this predicted address by this preparation.</p>
    </div> : <p className={styles.hint}>{expired ? "Simulation expired. Prepare again for current network checks." : "Save and prepare to check funding and simulate."}</p>}
    {input.devBuyUSDC !== "0" && <p className={styles.hint}>The creator buy is price-limited. Any unspent amount is refunded by the launch contract.</p>}
    <p className={styles.hint}>{LAUNCH_EXECUTION_ENABLED
      ? "Confirm launch authorizes the setup transactions and token deployment shown here. Preparation alone does not send transactions."
      : "Preparation only. No transaction will be signed or sent."}</p>
  </section>;
}
