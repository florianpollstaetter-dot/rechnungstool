---
title: "Rechnung an öffentliche Auftraggeber: XRechnung-Pflicht"
slug: rechnung-an-oeffentlichen-auftraggeber
publishedAt: null
category: E-Rechnung
tags:
  - Öffentliche Auftraggeber
  - XRechnung
  - B2G
  - Leitweg-ID
  - E-Rechnung
featuredImage: /images/blog/rechnung-an-oeffentlichen-auftraggeber.jpg
excerpt: "Rechnungen an Bund, Länder und Kommunen müssen als XRechnung eingereicht werden – inklusive Leitweg-ID. Dieser Guide erklärt die B2G-Pflichten und wie Sie sie erfüllen."
schema:
  type: FAQPage
  faqs:
    - question: "Müssen Rechnungen an öffentliche Auftraggeber elektronisch sein?"
      answer: "Ja. Rechnungen an Bundesbehörden müssen seit 2020 als XRechnung eingereicht werden. Viele Länder und Kommunen verlangen ebenfalls E-Rechnungen. Reine PDF- oder Papierrechnungen werden von öffentlichen Auftraggebern in der Regel nicht mehr akzeptiert."
    - question: "Was ist die Leitweg-ID?"
      answer: "Die Leitweg-ID ist eine eindeutige Adressierungsnummer, die die Rechnung an die richtige Stelle innerhalb der öffentlichen Verwaltung leitet. Sie ist bei B2G-Rechnungen ein Pflichtfeld und wird vom Auftraggeber vergeben."
    - question: "Welches Format brauche ich für B2G-Rechnungen?"
      answer: "Für öffentliche Auftraggeber ist die XRechnung (reines XML nach EN 16931) der Standard. ZUGFeRD ab Profil EN 16931 wird von vielen Stellen ebenfalls akzeptiert, da es XRechnung-konform ist."
    - question: "Wo reiche ich E-Rechnungen an den Bund ein?"
      answer: "Über zentrale Rechnungseingangsplattformen wie die ZRE (Zentrale Rechnungseingangsplattform des Bundes) oder die OZG-RE. Länder und Kommunen betreiben teils eigene Portale."
---

# Rechnung an öffentliche Auftraggeber: Die XRechnung-Pflicht

Wer an **Bund, Länder oder Kommunen** fakturiert, spielt nach anderen Regeln als im normalen B2B-Geschäft. Öffentliche Auftraggeber (B2G – Business-to-Government) verlangen strukturierte elektronische Rechnungen – meist als **XRechnung**, adressiert über eine **Leitweg-ID**. Papier- oder einfache PDF-Rechnungen werden in der Regel abgelehnt.

Dieser Guide erklärt die B2G-Pflichten und wie Sie sie erfüllen.

---

## Die E-Rechnungspflicht im öffentlichen Sektor

Seit **November 2020** müssen Rechnungen an **Bundesbehörden** elektronisch als [XRechnung](/blog/xrechnung-guide) eingereicht werden. Die Pflicht basiert auf der EU-Richtlinie 2014/55/EU und der E-Rechnungsverordnung des Bundes.

Für **Länder und Kommunen** gelten teils eigene Regelungen – viele haben die E-Rechnungspflicht ebenfalls eingeführt oder akzeptieren freiwillig E-Rechnungen. Im Zweifel: beim Auftraggeber nachfragen.

---

## Welches Format? XRechnung vs. ZUGFeRD

### XRechnung (Standard für B2G)

Die **XRechnung** ist ein reines XML-Format nach der Norm EN 16931. Sie enthält keine sichtbare PDF-Ebene, sondern nur strukturierte Daten. Für öffentliche Auftraggeber ist sie der Standard.

### ZUGFeRD (oft ebenfalls akzeptiert)

[ZUGFeRD](/blog/zugferd-rechnung) ab Profil EN 16931 ist XRechnung-konform (die eingebettete XML entspricht der Norm) und wird von vielen Stellen akzeptiert. Prüfen Sie aber, ob Ihr konkreter Auftraggeber ZUGFeRD annimmt oder reines XRechnung-XML verlangt.

---

## Die Leitweg-ID: das entscheidende Pflichtfeld

Die **Leitweg-ID** ist das Herzstück jeder B2G-Rechnung. Sie ist eine eindeutige Nummer, die die Rechnung an die richtige Stelle innerhalb der Verwaltung leitet.

- Wird vom **Auftraggeber vergeben** – fragen Sie danach, wenn sie nicht im Auftrag steht
- Ist ein **Pflichtfeld** in der XRechnung
- Fehlt sie oder ist sie falsch, wird die Rechnung **abgelehnt**

Aufbau (vereinfacht): `Grobadressierung-Feinadressierung-Prüfziffer`, z. B. `04011000-1234512345-06`.

---

## Weitere B2G-Pflichtangaben

Neben den [normalen Pflichtangaben nach §14 UStG](/blog/kleinunternehmer-19-ustg-rechnung) verlangen öffentliche Auftraggeber oft zusätzlich:

- **Leitweg-ID** (Pflicht)
- **Bestellnummer / Auftragsnummer** des Auftraggebers
- **Lieferanten- bzw. Kreditorennummer**
- **Zahlungsbedingungen** in strukturierter Form
- korrekte **Bankverbindung**

---

## Wo reiche ich die Rechnung ein?

### Bund

- **ZRE** (Zentrale Rechnungseingangsplattform des Bundes)
- **OZG-RE** (für weitere Bundesstellen)

Einreichung per Upload, E-Mail (mit XML-Anhang) oder Peppol-Netzwerk.

### Länder & Kommunen

Viele betreiben eigene Portale oder nutzen ebenfalls Peppol. Der Auftraggeber nennt Ihnen den Weg.

### Peppol

**Peppol** ist ein europäisches Netzwerk für den standardisierten Austausch elektronischer Rechnungen. Über einen Peppol-Zugangspunkt lassen sich E-Rechnungen direkt und sicher an angeschlossene Behörden übermitteln.

---

## So erfüllen Sie die B2G-Pflichten mit Software

1. Rechnung in der Software erfassen
2. Format **XRechnung** (oder ZUGFeRD EN 16931) wählen
3. **Leitweg-ID** und ggf. Bestellnummer eintragen
4. Datei erzeugen und über das passende Portal / Peppol einreichen

**Orange Octo** erzeugt normkonforme XRechnungen inklusive Leitweg-ID-Feld – bereit für ZRE, OZG-RE und Peppol. [Kostenlos testen →](https://orangeocto.com)

---

## Häufige Fehler bei B2G-Rechnungen

1. **Leitweg-ID fehlt oder falsch:** Häufigster Ablehnungsgrund.
2. **Falsches Format:** PDF statt XRechnung – wird nicht akzeptiert.
3. **Bestellnummer vergessen:** Viele Behörden verlangen sie zwingend.
4. **Falscher Einreichungsweg:** Rechnung per normaler E-Mail statt über das Portal/Peppol.

---

## Fazit

Rechnungen an öffentliche Auftraggeber folgen strengen Regeln: **XRechnung als Format, Leitweg-ID als Pflichtfeld** und Einreichung über die richtigen Plattformen. Wer diese Punkte beachtet, wird pünktlich bezahlt – wer sie ignoriert, riskiert Ablehnung und Zahlungsverzug.

Mit einer Software, die XRechnung und Leitweg-ID nativ unterstützt, wird die B2G-Rechnung zur Routine. Klären Sie die Leitweg-ID und den Einreichungsweg immer vorab mit dem Auftraggeber.

[XRechnung mit Orange Octo erstellen →](https://orangeocto.com)

---

## Häufig gestellte Fragen

**Müssen Rechnungen an öffentliche Auftraggeber elektronisch sein?**
Ja. Rechnungen an Bundesbehörden müssen seit 2020 als XRechnung eingereicht werden. Viele Länder und Kommunen verlangen ebenfalls E-Rechnungen. Reine PDF- oder Papierrechnungen werden von öffentlichen Auftraggebern in der Regel nicht mehr akzeptiert.

**Was ist die Leitweg-ID?**
Die Leitweg-ID ist eine eindeutige Adressierungsnummer, die die Rechnung an die richtige Stelle innerhalb der öffentlichen Verwaltung leitet. Sie ist bei B2G-Rechnungen ein Pflichtfeld und wird vom Auftraggeber vergeben.

**Welches Format brauche ich für B2G-Rechnungen?**
Für öffentliche Auftraggeber ist die XRechnung (reines XML nach EN 16931) der Standard. ZUGFeRD ab Profil EN 16931 wird von vielen Stellen ebenfalls akzeptiert, da es XRechnung-konform ist.

**Wo reiche ich E-Rechnungen an den Bund ein?**
Über zentrale Rechnungseingangsplattformen wie die ZRE (Zentrale Rechnungseingangsplattform des Bundes) oder die OZG-RE. Länder und Kommunen betreiben teils eigene Portale.

---

*Verwandte Artikel: [XRechnung Pflicht 2025: Der vollständige Leitfaden](/blog/xrechnung-guide) · [ZUGFeRD-Rechnung erstellen](/blog/zugferd-rechnung) · [Rechnungssoftware für Handwerker](/blog/rechnungssoftware-handwerker)*
