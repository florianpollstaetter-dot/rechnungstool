# Ratgeber Österreich — `/at/<slug>` (KIN-6527)

Eine Markdown-Datei je Seite: `content/at/<slug>.md` → `https://orange-octo.com/at/<slug>`.
Gerendert von `src/app/at/[slug]/page.tsx`, Logik in `src/lib/at-ratgeber.ts`.

## Front-Matter

```yaml
---
title: "…"            # Title-Tag, ≤ 60 Zeichen
h1: "…"               # sichtbare Überschrift (die erste `# …`-Zeile im Text wird ignoriert)
slug: "…"             # sonst Dateiname
metaDescription: "…"  # ≤ 155 Zeichen (Feld `meta` geht auch)
publishedAt: null      # ISO-Datum = live ab diesem Tag (Wien); Zukunft oder null = 404, nicht in Sitemap/Magazin
updatedAt: "YYYY-MM-DD"   # „Stand“ auf der Seite und lastmod in der Sitemap (Feld `stand` geht auch)
category: "…"
rubrik: "…"            # Magazin-Rubrik: Rechnungen schreiben | Steuern und Abgaben | Vorlagen und Rechner | Rechnungsprogramme im Vergleich (fehlt sie: aus category abgeleitet)
schema: FAQPage        # FAQ-Strukturdaten aus dem Abschnitt „## Häufige Fragen“ (**Frage?** + Antwortabsatz)
---
```

## Bausteine im Text

| Platzhalter | Ergebnis |
|---|---|
| `{{UID_PRUEFFORMULAR}}` | UID-Prüf-Formular (VIES), `src/components/at/UidPruefFormular.tsx` |
| `{{GRUENDER_NAME}}` | Name des Gründers (Textbaustein im Fließtext), Wert `GRUENDER_NAME` in `src/lib/at-ratgeber.ts`. Solange `null`: Platzhalter entfällt samt Klammer, „der Gründer ist Jurist ({{GRUENDER_NAME}}).“ wird zu „… Jurist.“ |

Bausteine (Formulare) auf eine eigene Zeile setzen. Unbekannte Platzhalter (`{{GFB_RECHNER}}`, `{{DOWNLOAD_…}}`) werden beim Rendern entfernt. Links auf `/at/<slug>`, die es noch nicht gibt, werden zu reinem Text.

## Entwürfe lokal ansehen

```bash
AT_RATGEBER_ENTWUERFE=1 npm run dev   # dann http://localhost:3000/at/<slug>
```

## Magazin und geplante Veröffentlichung (KIN-6649)

- Startseite `/at/magazin` listet alle veröffentlichten Seiten nach Rubrik (leere Rubriken ausgeblendet). `/at` leitet dorthin um.
- Jede Seite bekommt Brotkrumen (Magazin › Rubrik › Artikel), BreadcrumbList- und Article-Schema, „Mehr aus dem Magazin“ (3 Seiten, dieselbe Rubrik zuerst) und den Orange-Octo-Kasten mit `/register?utm_source=magazin&utm_campaign=<slug>`.
- **Planen:** `publishedAt` auf ein künftiges Datum setzen und pushen. Bis dahin 404; ab 00:00 Wien erzeugen sich Seite, Magazin und Sitemap stündlich neu (`revalidate = 3600`).
- Cron `/api/cron/magazin-freischaltung` (vercel.json, `0 5 * * *` UTC = 06:00 Wien im Winter) erzeugt die Tagesseiten sofort neu und meldet sie per IndexNow (Schlüssel in `src/lib/magazin/indexnow.ts`, Datei `public/<schlüssel>.txt`). Verpassten Tag nachmelden: `curl -H "Authorization: Bearer $CRON_SECRET" "https://orange-octo.com/api/cron/magazin-freischaltung?datum=YYYY-MM-DD"`.
- Google: kein Sitemap-Ping mehr möglich (seit 2023 abgeschaltet), Google liest die Sitemap über die Search Console.
