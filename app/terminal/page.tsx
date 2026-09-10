import { redirect } from "next/navigation";
import { pageMetadata } from "@/lib/site-metadata";
export const metadata = pageMetadata("/wallet");
export default function TerminalPage() { redirect("/wallet"); }
