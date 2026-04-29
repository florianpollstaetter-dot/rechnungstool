# `content/blog` — Editorial Drafts

Markdown-Drafts für SEO-Roadmap [SCH-912](/SCH/issues/SCH-912). Owner: Editor.
Engineer wired die finale Render-Pipeline (MDX, Sitemap, RSS) auf — siehe [SCH-910](/SCH/issues/SCH-910).

## Slug-Mapping

Die SEO-Plan-Spec [SCH-887#document-seo-sea-plan](/SCH/issues/SCH-887#document-seo-sea-plan) §2 definiert zwei URL-Klassen:

- **Pillar-Pages** auf Root-Pfad: `/rechnungsprogramm-oesterreich`, `/xrechnung-guide` …
- **Cluster-Posts** unter `/blog/<slug>`: `/blog/rechnung-schreiben-oesterreich-anleitung` …

Für Editorial-Workflow liegen beide Klassen in dieser Map flach unter `content/blog/<slug>.md`. Die Front-Matter `route` entscheidet, wo der Engineer renders. Beispiel:

```yaml
route: /rechnungsprogramm-oesterreich   # Pillar → Root-URL
route: /blog/rechnung-schreiben-oesterreich-anleitung  # Cluster → /blog/...
```

## Front-Matter-Schema

```yaml
---
title: "Rechnungsprogramm Österreich: KI-gestützt, FinanzOnline-tauglich, ab €9/Monat"
slug: rechnungsprogramm-oesterreich
route: /rechnungsprogramm-oesterreich
type: pillar                # pillar | cluster
publishedAt: 2026-05-06     # Mittwoch (Pillar) / Freitag (Cluster) — auf Soft-Hold bis SCH-910 fixed
updatedAt: 2026-04-29
author:
  name: Orange-Octo Editorial
  reviewedBy: ""            # Steuerberater-Name sobald EEAT-Reviewer da
category: Compliance
tags: [österreich, rechnungsprogramm, finanzonline, kleinunternehmer]
featuredImage: /og/rechnungsprogramm-oesterreich.png
excerpt: "Das schlanke Rechnungsprogramm für Solos & KMU in Österreich. KI-Belegerfassung, FinanzOnline-tauglich, 14 Tage gratis testen."
metaTitle: "Rechnungsprogramm Österreich — KI-Buchhaltung made in AT"
metaDescription: "Das schlanke Rechnungsprogramm für Solos & KMU in Österreich. KI-Belegerfassung, FinanzOnline-tauglich, 14 Tage gratis testen."
keywords:
  primary: rechnungsprogramm österreich
  secondary: [buchhaltungssoftware österreich, finanzonline export, rechnung schreiben österreich]
internalLinks:
  - /xrechnung-guide
  - /buchhaltungssoftware-oesterreich
  - /preise
schema: FAQPage             # FAQPage | Article | HowTo | (none)
wordCount: 2300
status: draft               # draft | review | ready | published
---
```

## Veröffentlichungs-Blocker

- `/robots.txt` + `/sitemap.xml` müssen 200 OK liefern → siehe [SCH-910](/SCH/issues/SCH-910)
- Bis dahin bleibt `status: draft`. Engineer/Editor schaltet auf `ready` wenn der Bug gefixt ist.

## SEO-Audit-Checkliste je Datei

Vor dem Push prüft der Editor:

- [ ] Title ≤60 Zeichen, Meta ≤155 Zeichen
- [ ] 1× H1, klare H2-Struktur
- [ ] Primär-Keyword in H1 + erstem Absatz + ≥3× im Body
- [ ] ≥3 internal Links (`internalLinks` in Front-Matter spiegeln)
- [ ] ≥1 external Link auf offizielle Quelle (BMF, BMI, KoSIT, WKO, oesterreich.gv.at)
- [ ] FAQ-Section bei Pillars (`schema: FAQPage`)
- [ ] Cluster→Pillar-Link im Intro + Fazit
- [ ] Max. 1× CTA pro 800 Wörter, kein Spam
- [ ] `du`-Form, kein Wettbewerber-Bashing, ehrliche Cons in Compare-Posts

## Produktions-Cadence

Mittwoch Pillar | Freitag Cluster | je Woche 2 Files. Status-Comment auf [SCH-912](/SCH/issues/SCH-912) wöchentlich.
