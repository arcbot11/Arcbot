import { permanentRedirect } from "next/navigation";
import { pageMetadata } from "@/lib/site-metadata";

export const metadata = pageMetadata("/guide");

export default function PreviousGuide() {
  permanentRedirect("/guide");
}
