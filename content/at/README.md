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
publishedAt: null      # ISO-Datum = live; null = Entwurf (404 im Produktivbetrieb)
updatedAt: "YYYY-MM-DD"   # „Stand“ auf der Seite und lastmod in der Sitemap (Feld `stand` geht auch)
category: "…"
schema: FAQPage        # FAQ-Strukturdaten aus dem Abschnitt „## Häufige Fragen“ (**Frage?** + Antwortabsatz)
---
```

## Bausteine im Text

| Platzhalter | Ergebnis |
|---|---|
| `{{UID_PRUEFFORMULAR}}` | UID-Prüf-Formular (VIES), `src/components/at/UidPruefFormular.tsx` |

Platzhalter auf eine eigene Zeile setzen. Unbekannte Platzhalter bleiben als Text stehen.

## Entwürfe lokal ansehen

```bash
AT_RATGEBER_ENTWUERFE=1 npm run dev   # dann http://localhost:3000/at/<slug>
```
