// KIN-6650 — Vorlagen zum Download: /at/vorlagen/<datei>.docx bzw. .pdf
//
// Die Dateien werden beim Abruf aus src/lib/at-vorlagen/vorlagen.ts erzeugt
// (Word über docx, PDF mit ausfüllbaren Feldern über pdf-lib).
// Live erst, wenn ein sichtbarer Artikel unter content/at/ den Baustein
// {{DOWNLOAD_<NAME>}} enthält — vorher 404 (gleiche Regel wie für die Seiten,
// inkl. AT_RATGEBER_ENTWUERFE=1 für die Vorschau).

import { istBausteinSichtbar } from "@/lib/at-ratgeber";
import { findeVorlageNachDatei } from "@/lib/at-vorlagen/vorlagen";
import { vorlageAlsDocx } from "@/lib/at-vorlagen/docx";
import { vorlageAlsPdf } from "@/lib/at-vorlagen/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPEN = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;

function nichtGefunden() {
  return new Response("Nicht gefunden", { status: 404, headers: { "Cache-Control": "no-store" } });
}

export async function GET(_req: Request, { params }: { params: Promise<{ datei: string }> }) {
  const { datei } = await params;
  const m = /^([a-z0-9-]+)\.(pdf|docx)$/.exec(datei);
  if (!m) return nichtGefunden();
  const [, name, endung] = m as unknown as [string, string, keyof typeof TYPEN];
  const vorlage = findeVorlageNachDatei(name);
  if (!vorlage || !(await istBausteinSichtbar(`DOWNLOAD_${vorlage.baustein}`))) return nichtGefunden();

  const inhalt = endung === "pdf" ? await vorlageAlsPdf(vorlage) : await vorlageAlsDocx(vorlage);
  return new Response(new Uint8Array(inhalt), {
    headers: {
      "Content-Type": TYPEN[endung],
      // PDF öffnet sich im Browser (auch am Handy), Word wird heruntergeladen.
      "Content-Disposition": `${endung === "pdf" ? "inline" : "attachment"}; filename="${name}.${endung}"`,
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      "X-Robots-Tag": "noindex",
    },
  });
}
