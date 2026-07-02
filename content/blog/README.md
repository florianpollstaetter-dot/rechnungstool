# Blog-Content — Orange Octo (SEO-Roadmap SCH-912)

Quelle: 24-Artikel-Roadmap aus [SCH-887 §2](/SCH/issues/SCH-887#document-seo-sea-plan). Ziel: 12 Pillar + 12 Cluster = 24 indexierbare URLs in 12 Wochen (DACH-SEO).

## Ablage

- Ein Markdown-File pro Artikel: `content/blog/<slug>.md`
- `<slug>` = die letzte URL-Komponente aus der Roadmap (ohne führenden `/blog/` bzw. `/`).
  - Pillars rendern auf Root-Level (`/rechnungsprogramm-oesterreich`), Cluster unter `/blog/…`. Der Zielpfad steht im Front-Matter-Feld `route`.

## Front-Matter (YAML)

```yaml
---
title: "…"            # SEO Title-Tag, ≤60 Zeichen
h1: "…"               # sichtbare H1 (darf länger als der Title sein)
slug: "…"             # Datei-Slug
route: "/…"           # tatsächlicher Veröffentlichungspfad
metaDescription: "…"  # ≤155 Zeichen
publishedAt: null      # ISO-Datum sobald live; null = noch nicht veröffentlicht
updatedAt: "YYYY-MM-DD"
category: "…"         # z.B. Compliance, Vergleich, Anleitung, Grundlagen
type: pillar|cluster
targetKeyword: "…"
tags: ["…", "…"]
featuredImage: "/og/<slug>.png"   # Designer-Hand-off, Datei noch nicht vorhanden
excerpt: "…"          # 1–2 Sätze für Blog-Listing + OG-Description
schema: FAQPage       # oder HowTo / Article — entsprechend der Section
pillarRef: "/…"       # nur bei Clustern: Parent-Pillar-Route
---
```

## SEO-Audit-Regeln (pro Artikel, Yoast/RankMath-Style)

- Title-Tag < 60 Zeichen, Meta-Description < 155 Zeichen
- Keyword-Density 1–2 % auf das `targetKeyword`
- Interne Links ≥ 3, externe (autoritative Quellen) ≥ 1
- FAQ-Section mit `FAQPage`-Schema, wo im Brief vorgesehen
- In-Content-Trial-CTA max. 1× je 800 Wörter (kein CTA-Spam)
- EEAT: Autoren-/Reviewer-Box, Quellenangaben, sichtbares Update-Datum

## Veröffentlichungs-Voraussetzung (Blocker)

Artikel liegen fertig im Repo, gehen aber erst live, wenn der robots/sitemap-Fix
+ Datenschutz-Tracking-Patch aus [SCH-910](/SCH/issues/SCH-910) deployed sind.
Bis dahin bleibt `publishedAt: null`.

## Status

Siehe `content/blog/ROADMAP.md` für den Fortschritt aller 24 Artikel.
