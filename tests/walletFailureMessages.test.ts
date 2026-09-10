import { describe, expect, it } from "vitest";
import { safeFailure } from "../convex/wallets";

describe("wallet failure messages", () => {
  it.each([
    "signer /v1/transactions/execute returned 400: launchAndBuy reverted with selector 0x85b8e2f4",
    "execution reverted: MetadataTooLong()",
  ])("explains the Argus metadata byte limit for %s", (detail) => {
    expect(safeFailure(new Error(detail), "launch")).toBe(
      "Action needed: The special characters in the name or ticker exceed Argus's onchain byte limit. Shorten the name or ticker, then reply with the launch request again.",
    );
  });

  it("explains when a launch wallet cannot cover value and gas", () => {
    expect(safeFailure(new Error("The total cost (gas * gas fee + value) of executing this transaction exceeds the balance of the account.")))
      .toBe("You'll need to fund your wallet with ETH for gas to complete this transaction. Fund it, then reply “resume”.");
  });

  it("does not describe a failed buy as a launch", () => {
    expect(safeFailure(new Error("The total cost (gas * gas fee + value) of executing this transaction exceeds the balance of the account."), "buy"))
      .toBe("You'll need to fund your wallet with ETH for gas to buy. Fund it, then reply “resume”.");
  });

  it("maps the signer's pre-sign maximum-cost check to the launch gas response", () => {
    expect(safeFailure(new Error("transaction total cost (gas * gas fee + value) exceeds the balance"), "launch"))
      .toBe("You'll need to fund your wallet with ~0.0015 ETH for gas and the Argus launch fee. Fund it, then reply “resume”.");
  });

  it("shows the signer's simulated gas budget with its single 10% margin", () => {
    expect(safeFailure(new Error("transaction total cost (gas * gas fee + value) exceeds the balance [gas_estimate_wei=123456789000000]"), "buy"))
      .toBe("Simulated gas for this transaction is 0.00012346 ETH. Fund your wallet to buy, then reply “resume”.");
  });

  it("identifies the launch fee separately from the simulated gas estimate", () => {
    expect(safeFailure(new Error("insufficient ETH for gas [gas_estimate_wei=500000000000000]"), "launch"))
      .toBe("Simulated gas for this transaction is 0.0005 ETH. You'll also need the Argus launch fee. Fund your wallet, then reply “resume”.");
  });

  it("shows the combined simulated gas and Argus launch fee when supplied by the signer", () => {
    expect(safeFailure(new Error("transaction total cost (gas * gas fee + value) exceeds the balance [launch_cost_estimate_wei=750000000000000]"), "launch"))
      .toBe("Simulated gas and Argus launch fee for this transaction is 0.00075 ETH. Fund your wallet, then reply “resume”.");
  });

  it("explains when an earlier wallet operation still holds the execution lease", () => {
    expect(safeFailure(new Error("another wallet transaction is still being prepared; try again shortly")))
      .toBe("Pending: Wallet busy. Wait for the pending transaction.");
  });
});
