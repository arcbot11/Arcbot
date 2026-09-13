import type {RecordValue} from "../../lib/otc/model";

/** Stored alongside every financial record in the same mutation as its JSON. */
export function walletExportIndexes(record:RecordValue){
  return {
    normalizedWallet:record.kind==="transaction"?record.wallet.toLowerCase():undefined,
    escrowAddress:record.kind==="listing"?record.escrow?.address?.toLowerCase():undefined,
  };
}
