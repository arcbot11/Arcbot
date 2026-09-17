import { SiteHeader, SiteFooter } from "@/components/SiteChrome";
import { ClaimControls } from "@/components/ClaimControls";
import { pageMetadata } from "@/lib/site-metadata";
import "./claim.css";
export const dynamic="force-dynamic";
export const metadata=pageMetadata("/claim","Distribute Argus token fees and send funded rewards to holders on Arc Chain.");
export default function ClaimPage(){return <main><SiteHeader/><ClaimControls/><SiteFooter/></main>;}
