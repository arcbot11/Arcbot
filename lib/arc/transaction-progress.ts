export type TransactionStatus={id:string;status:string;leg?:string;hash?:string;confirmation?:{status:"success"|"reverted";blockNumber:string};details?:Array<{label:string;value:string}>};
export function transactionProgress(status:string,action:string){
  switch(status){
    case "prepared":return `Preparing ${action} signature…`;
    case "signed":return `Submitting ${action}…`;
    case "submitted":return `Confirming ${action}…`;
    case "completed":return `${action[0].toUpperCase()+action.slice(1)} completed.`;
    case "cancelled":return "Trade expired before signing. Funds released. Submit again.";
    case "reverted":return `${action[0].toUpperCase()+action.slice(1)} reverted. Check transaction history.`;
    default:throw new Error("Transaction status unavailable. Check transaction history before submitting again.");
  }
}
export async function readTransactionStatus(id:string):Promise<TransactionStatus>{
  const response=await fetch(`/api/wallet/transaction?id=${encodeURIComponent(id)}`,{cache:"no-store",signal:AbortSignal.timeout(45000)});
  if(!response.ok)throw new Error("Status could not refresh. Check transaction history before submitting again.");
  return response.json();
}
export async function waitForTransaction(initial:TransactionStatus,action:string,io:{read:(id:string)=>Promise<TransactionStatus>;wait:()=>Promise<void>;active:()=>boolean;progress:(message:string)=>void}){
  let result=initial;
  while(io.active()){
    if(!io.active())throw new Error("Tracking stopped. Check transaction history before submitting again.");
    if(result.id!==initial.id||result.leg!==initial.leg)throw new Error("Unexpected transaction status. Check transaction history.");
    io.progress(result.status==="submitted"&&result.confirmation
      ?result.confirmation.status==="success"?`${action[0].toUpperCase()+action.slice(1)} received on Base. Verifying delivery…`:`${action[0].toUpperCase()+action.slice(1)} reverted on Base. Verifying receipt…`
      :transactionProgress(result.status,action));
    if(result.status==="completed")return result;
    if(result.status==="reverted"||result.status==="cancelled")throw new Error(transactionProgress(result.status,action));
    await io.wait();
    if(!io.active())throw new Error("Tracking stopped. Check transaction history before submitting again.");
    try{result=await io.read(initial.id);}catch{
      io.progress(`Reconnecting to check ${action} confirmation…`);
      // A failed read is not a failed transaction. Retry without authorizing another send.
      do{await io.wait();if(!io.active())break;try{result=await io.read(initial.id);break;}catch{/* Retry while the controls remain active. */}}while(io.active());
    }
  }
  throw new Error("Tracking stopped. Check transaction history before submitting again.");
}
