export type ArgusPoolMetrics = {address?:string;usdAnchored?:boolean;fdvUsd?:number;marketCapUsd?:number;volume24hUsd?:number;liquidityUsd?:number;swaps24h?:number};
export function screenArgusPool(pool:ArgusPoolMetrics|null|undefined): {marketCapUsd:number;volume24hUsd:number;liquidityUsd:number;trades:number;pool?:string}|null;
export function preferDeeperPool<T extends ArgusPoolMetrics>(previous:T|null|undefined,next:T|null|undefined):T|null|undefined;
