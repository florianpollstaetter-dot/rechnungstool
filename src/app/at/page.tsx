import { permanentRedirect } from "next/navigation";

// KIN-6527 — frühere Übersicht der Ratgeberseiten Österreich.
// KIN-6649 — ersetzt durch die Magazin-Startseite /at/magazin.
export default function AtIndexPage() {
  permanentRedirect("/at/magazin");
}
