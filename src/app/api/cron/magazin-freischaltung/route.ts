// KIN-6649 — Vercel-Cron: tägliche Freischaltung der Magazin-Artikel.
//
// Schedule: `0 5 * * *` (UTC) = 06:00 Wien im Winter, 07:00 im Sommer. In vercel.json.
//
// Seiten mit publishedAt in der Zukunft sind bis zu diesem Tag 404 und fehlen in
// Sitemap und Magazin (istVeroeffentlicht in src/lib/at-ratgeber.ts). Die Seiten
// erzeugen sich ohnehin stündlich neu (revalidate = 3600); dieser Cron
//   1. erzeugt Artikel, Magazin-Startseite und Sitemap sofort neu (revalidatePath),
//   2. meldet die heute erschienenen URLs per IndexNow.
//
// Authentifizierung wie /api/treasury/ebics/poll: `Authorization: Bearer $CRON_SECRET`.
// `?datum=YYYY-MM-DD` meldet einen verpassten Tag nach (nur Daten bis heute).

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getHeuteErscheinendeAtSeiten, heuteInWien, SITE_URL } from "@/lib/at-ratgeber";
import { meldeIndexNow } from "@/lib/magazin/indexnow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET not configured" }, { status: 503 });
  if (!timingSafeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const heute = heuteInWien();
  const angefragt = new URL(request.url).searchParams.get("datum");
  const datum = angefragt && /^\d{4}-\d{2}-\d{2}$/.test(angefragt) && angefragt <= heute ? angefragt : heute;

  const seiten = await getHeuteErscheinendeAtSeiten(datum);
  for (const s of seiten) revalidatePath(`/at/${s.slug}`);
  revalidatePath("/at/magazin");
  revalidatePath("/sitemap.xml");

  const urls = seiten.length > 0 ? [...seiten.map((s) => `${SITE_URL}/at/${s.slug}`), `${SITE_URL}/at/magazin`] : [];
  const indexNow = await meldeIndexNow(SITE_URL, urls);

  return NextResponse.json({ ok: true, datum, freigeschaltet: seiten.map((s) => s.slug), indexNow });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
