import type {TransactionStatus} from "./transaction-progress";

/** Completion amounts must come from settlement, never from an estimate. */
export function completedTrade(side:"buy"|"sell"|"swap",result:TransactionStatus){
  if(result.status!=="completed"||result.leg!=="swap")throw new Error("Trade is not completed.");
  const details=result.details??[];
  const received=details.find(d=>d.label==="Received")?.value;
  const lines=[`${side[0].toUpperCase()+side.slice(1)} completed.`];
  for(const label of ["Input","Received","Gas paid","Route"]){
    const value=details.find(d=>d.label===label)?.value;
    if(value)lines.push(`${label}: ${value}.`);
  }
  if(!received)lines.push("Received amount unavailable.");
  if(result.hash)lines.push(`Transaction: ${result.hash}`);
  return {received,hash:result.hash,message:lines.join(" ")};
}
