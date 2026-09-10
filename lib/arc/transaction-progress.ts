export type TransactionStatus={id:string;status:string;leg?:string};
export function transactionProgress(status:string,action:string){
  switch(status){
    case "prepared":return `Preparing ${action} signature…`;
    case "signed":return `Submitting ${action}…`;
    case "submitted":return `Confirming ${action}…`;
    case "completed":return `${action[0].toUpperCase()+action.slice(1)} completed.`;
    case "reverted":return `${action[0].toUpperCase()+action.slice(1)} reverted. Check transaction history.`;
    default:throw new Error("Transaction status unavailable. Check transaction history before submitting again.");
  }
}
export async function readTransactionStatus(id:string):Promise<TransactionStatus>{
  const response=await fetch(`/api/wallet/transaction?id=${encodeURIComponent(id)}`,{cache:"no-store",signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error("Status could not refresh. Check transaction history before submitting again.");
  return response.json();
}
export async function waitForTransaction(initial:TransactionStatus,action:string,io:{read:(id:string)=>Promise<TransactionStatus>;wait:()=>Promise<void>;active:()=>boolean;progress:(message:string)=>void}){
  let result=initial;
  for(let attempt=0;attempt<=30;attempt++){
    if(!io.active())throw new Error("Tracking stopped. Check transaction history before submitting again.");
    if(result.id!==initial.id||result.leg!==initial.leg)throw new Error("Unexpected transaction status. Check transaction history.");
    io.progress(transactionProgress(result.status,action));
    if(result.status==="completed")return result;
    if(result.status==="reverted")throw new Error(transactionProgress(result.status,action));
    if(attempt===30)break;
    await io.wait();
    if(!io.active())throw new Error("Tracking stopped. Check transaction history before submitting again.");
    try{result=await io.read(initial.id);}catch{throw new Error("Status could not refresh. The transaction may still complete. Check transaction history before submitting again.");}
  }
  throw new Error(`${action[0].toUpperCase()+action.slice(1)} is still pending. Check transaction history before submitting again.`);
}
