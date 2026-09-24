import { SiteHeader, SiteFooter } from "@/components/SiteChrome";
import { BridgePage } from "@/components/BridgePage";
import { pageMetadata } from "@/lib/site-metadata";
export const metadata = {
  ...pageMetadata(
    "/bridge",
    "Bridge supported tokens between Arc and Base with a connected wallet or Argos Bot Wallet using Circle CTS.",
  ),
  title: "Arc ↔ Base Bridge | Argos Bot",
};
export default function Page() {
  return (
    <main>
      <SiteHeader />
      <BridgePage />
      <SiteFooter />
    </main>
  );
}
