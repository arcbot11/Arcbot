import { handleFeeApi } from "@/lib/fee-report/api";
export const runtime="nodejs";
export const maxDuration=300;
export const POST=(request:Request)=>handleFeeApi(request,"claim");
