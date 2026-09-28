import { handleFeeApi } from "@/lib/fee-report/api";
export const runtime="nodejs";
export const maxDuration=300;
export const GET=(request:Request)=>handleFeeApi(request,"report");
