import { handleVercel } from "../../../../lib/agent-bridge/vercel";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const GET = handleVercel;
export const POST = handleVercel;
