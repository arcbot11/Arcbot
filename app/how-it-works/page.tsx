import { permanentRedirect } from "next/navigation";

export default function PreviousGuide() {
  permanentRedirect("/guide");
}
