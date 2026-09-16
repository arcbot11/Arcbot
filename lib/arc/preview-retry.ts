import {tradeSimulationFailure} from './trade-errors';

/** Preparation only: reprice once at unchanged slippage, before any submission.
 * The caller retains the verified route identity, never the old execution price. */
export async function retryMovedPreview<T>(prepare:()=>Promise<T>):Promise<T>{
  try{return await prepare();}
  catch(error){
    if(tradeSimulationFailure(error)!=='minimum_output')throw error;
    return prepare();
  }
}
