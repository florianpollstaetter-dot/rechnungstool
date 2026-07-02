---
title: "ZUGFeRD-Rechnung erstellen: Der komplette Guide 2025"
slug: zugferd-rechnung
publishedAt: null
category: E-Rechnung
tags:
  - ZUGFeRD
  - E-Rechnung
  - XRechnung
  - Hybrid-Rechnung
  - PDF/A-3
featuredImage: /images/blog/zugferd-rechnung.jpg
excerpt: "ZUGFeRD kombiniert PDF und strukturierte XML-Daten in einer Datei – ideal für die E-Rechnungspflicht 2025. Dieser Guide erklärt Formate, Profile und wie Sie ZUGFeRD-Rechnungen erstellen."
schema:
  type: FAQPage
  faqs:
    - question: "Was ist eine ZUGFeRD-Rechnung?"
      answer: "ZUGFeRD ist ein hybrides E-Rechnungsformat: Es bettet strukturierte XML-Daten in eine PDF/A-3-Datei ein. Menschen sehen ein normales PDF, Maschinen lesen die eingebetteten XML-Daten automatisch aus."
    - question: "Was ist der Unterschied zwischen ZUGFeRD und XRechnung?"
      answer: "XRechnung ist ein reines XML-Format ohne menschenlesbares PDF, vorgeschrieben für öffentliche Auftraggeber (B2G). ZUGFeRD ist hybrid (PDF + XML). ZUGFeRD ab Profil EN 16931 ist XRechnung-konform und damit auch B2G-tauglich."
    - question: "Ist ZUGFeRD für die E-Rechnungspflicht 2025 zulässig?"
      answer: "Ja. ZUGFeRD ab Version 2.x (Profil EN 16931 oder höher) erfüllt die europäische Norm EN 16931 und ist damit für die B2B-E-Rechnungspflicht ab 2025 zulässig."
    - question: "Welche ZUGFeRD-Profile gibt es?"
      answer: "Die wichtigsten Profile sind MINIMUM, BASIC WL, BASIC, EN 16931 (Comfort) und EXTENDED. Für die gesetzliche E-Rechnungspflicht ist mindestens das Profil EN 16931 erforderlich."
---

# ZUGFeRD-Rechnung erstellen: Der komplette Guide 2025

Mit der [E-Rechnungspflicht ab 2025](/blog/xrechnung-guide) müssen Unternehmen im B2B-Bereich strukturierte elektronische Rechnungen austauschen können. Neben der reinen XML-Variante **XRechnung** hat sich ein zweites Format etabliert: **ZUGFeRD** – ein hybrides Format, das PDF und maschinenlesbare Daten kombiniert.

Dieser Guide erklärt, was ZUGFeRD genau ist, welche Profile es gibt, wie es sich von XRechnung unterscheidet und wie Sie ZUGFeRD-Rechnungen korrekt erstellen.

---

## Was ist ZUGFeRD?

**ZUGFeRD** steht für „Zentraler User Guide des Forums elektronische Rechnung Deutschland". Es ist ein **hybrides E-Rechnungsformat**, das zwei Welten vereint:

- Ein **menschenlesbares PDF** (PDF/A-3), das jeder öffnen und lesen kann
- Eine **eingebettete XML-Datei** mit den strukturierten Rechnungsdaten, die Maschinen automatisch verarbeiten

Der Clou: Beides steckt in **einer einzigen Datei**. Der Empfänger sieht ein normales PDF – seine Buchhaltungssoftware liest gleichzeitig die XML-Daten automatisch aus. Kein manuelles Abtippen mehr.

---

## ZUGFeRD vs. XRechnung: der Unterschied

Beide Formate erfüllen die europäische Norm **EN 16931**, unterscheiden sich aber grundlegend:

| Merkmal | ZUGFeRD | XRechnung |
|---------|---------|-----------|
| Aufbau | Hybrid (PDF + XML) | Reines XML |
| Menschenlesbar | ✅ (PDF sichtbar) | ✗ (nur mit Viewer) |
| Einsatz | B2B, B2G | vor allem B2G |
| Norm EN 16931 | ✅ (ab Profil EN 16931) | ✅ |
| Dateiendung | .pdf | .xml |

**Wichtig:** ZUGFeRD ab dem Profil **EN 16931** ist XRechnung-konform. Das bedeutet: Die eingebettete XML entspricht der XRechnung-Spezifikation und ist damit auch für öffentliche Auftraggeber (B2G) zulässig.

Mehr zu XRechnung im [XRechnung-Pflicht-Guide](/blog/xrechnung-guide).

---

## Die ZUGFeRD-Profile im Überblick

ZUGFeRD kennt mehrere **Profile**, die sich im Detailgrad der strukturierten Daten unterscheiden:

| Profil | Beschreibung | E-Rechnungspflicht-tauglich? |
|--------|--------------|------------------------------|
| **MINIMUM** | Nur Basisdaten (z. B. für Buchungshilfe) | ✗ |
| **BASIC WL** | Ohne Positionsdaten (without lines) | ✗ |
| **BASIC** | Einfache Rechnungen mit Positionen | teilweise |
| **EN 16931 (Comfort)** | Voll EN-16931-konform | ✅ |
| **EXTENDED** | Erweiterte Felder für komplexe Fälle | ✅ |

**Für die gesetzliche E-Rechnungspflicht ab 2025 brauchen Sie mindestens das Profil EN 16931.** Die niedrigeren Profile (MINIMUM, BASIC WL) genügen nicht als vollwertige E-Rechnung.

---

## Wann sollten Sie ZUGFeRD statt XRechnung nutzen?

### ZUGFeRD ist ideal, wenn …

- Sie **B2B-Rechnungen** verschicken und der Empfänger auch ein lesbares PDF möchte
- Sie ein Format wollen, das **ohne Spezial-Viewer** lesbar ist
- Ihre Kunden gemischt sind (manche verarbeiten XML automatisch, andere lesen nur das PDF)

### XRechnung ist Pflicht, wenn …

- Sie an **öffentliche Auftraggeber** (Bund, Länder, Kommunen) fakturieren – hier ist oft reines XRechnung-XML gefordert. Siehe [Rechnung an öffentliche Auftraggeber](/blog/rechnungsprogramm-oesterreich).

In der Praxis ist ZUGFeRD (Profil EN 16931) der **flexibelste Kompromiss**: hybrid, normkonform und für beide Welten geeignet.

---

## ZUGFeRD-Rechnung erstellen: So geht's

### Der falsche Weg: manuell

Eine ZUGFeRD-Datei von Hand zu bauen, ist praktisch unmöglich – Sie müssten PDF/A-3 erzeugen und normkonformes XML einbetten. Das ist ein Fall für Software.

### Der richtige Weg: mit Software

Modernes Rechnungsprogramm erzeugt ZUGFeRD automatisch:

1. Rechnung wie gewohnt erfassen (Kunde, Positionen, Beträge)
2. Format „ZUGFeRD" (Profil EN 16931) wählen
3. Software erzeugt PDF/A-3 mit eingebetteter XML
4. Datei per E-Mail oder Portal versenden

**Orange Octo** erzeugt ZUGFeRD- und [XRechnung](/blog/xrechnung-guide)-Dateien nativ – ein Klick, und die Rechnung ist normkonform. [Kostenlos testen →](https://orangeocto.com)

---

## Pflichtangaben in der ZUGFeRD-XML

Die eingebettete XML muss alle Pflichtangaben nach EN 16931 enthalten – dieselben, die auch für [Papierrechnungen nach §14 UStG](/blog/kleinunternehmer-19-ustg-rechnung) gelten, plus strukturierte Felder:

- Rechnungsnummer, -datum
- Verkäufer- und Käuferdaten inkl. USt-IdNr.
- Leitweg-ID (bei B2G)
- Positionsdaten (Menge, Einzelpreis, Steuersatz)
- Steueraufschlüsselung
- Zahlungsbedingungen und Bankverbindung

Fehlt ein Pflichtfeld, ist die XML nicht valide – die Rechnung kann abgelehnt werden.

---

## ZUGFeRD empfangen und verarbeiten

Auch als **Empfänger** profitieren Sie von ZUGFeRD:

1. Sie erhalten eine PDF-Datei wie gewohnt
2. Ihre Buchhaltungssoftware erkennt die eingebettete XML
3. Rechnungsdaten werden automatisch übernommen – kein Abtippen
4. Buchungsvorschläge entstehen automatisch

Ab 2025 müssen alle B2B-Unternehmen E-Rechnungen **empfangen** können – auch [Kleinunternehmer](/blog/buchhaltungssoftware-kleinunternehmer). Eine ZUGFeRD-fähige Software ist daher Pflicht, nicht Kür.

---

## Häufige Fehler bei ZUGFeRD

1. **Falsches Profil:** MINIMUM oder BASIC WL genügen nicht der E-Rechnungspflicht. Mindestens EN 16931 wählen.
2. **Kein PDF/A-3:** Nur PDF/A-3 erlaubt eingebettete Dateien. Ein normales PDF funktioniert nicht.
3. **XML und PDF divergieren:** Die sichtbaren PDF-Werte und die XML-Daten müssen identisch sein – sonst drohen Prüfungsprobleme.
4. **Leitweg-ID vergessen (B2G):** Bei öffentlichen Auftraggebern ist die Leitweg-ID Pflicht.

---

## Fazit

ZUGFeRD ist der pragmatische Standard für die E-Rechnung: hybrid, menschen- **und** maschinenlesbar, normkonform ab Profil EN 16931. Für B2B-Rechnungen ist es meist die flexibelste Wahl, weil es sowohl das gewohnte PDF als auch die strukturierten Daten liefert.

Die praktische Umsetzung gelingt nur mit Software – manuell ist ZUGFeRD nicht machbar. Achten Sie auf das richtige Profil (mind. EN 16931) und darauf, dass Ihre Lösung auch das **Empfangen** von E-Rechnungen unterstützt.

[ZUGFeRD-Rechnungen mit Orange Octo erstellen →](https://orangeocto.com)

---

## Häufig gestellte Fragen

**Was ist eine ZUGFeRD-Rechnung?**
ZUGFeRD ist ein hybrides E-Rechnungsformat: Es bettet strukturierte XML-Daten in eine PDF/A-3-Datei ein. Menschen sehen ein normales PDF, Maschinen lesen die eingebetteten XML-Daten automatisch aus.

**Was ist der Unterschied zwischen ZUGFeRD und XRechnung?**
XRechnung ist ein reines XML-Format ohne menschenlesbares PDF, vorgeschrieben für öffentliche Auftraggeber (B2G). ZUGFeRD ist hybrid (PDF + XML). ZUGFeRD ab Profil EN 16931 ist XRechnung-konform und damit auch B2G-tauglich.

**Ist ZUGFeRD für die E-Rechnungspflicht 2025 zulässig?**
Ja. ZUGFeRD ab Version 2.x (Profil EN 16931 oder höher) erfüllt die europäische Norm EN 16931 und ist damit für die B2B-E-Rechnungspflicht ab 2025 zulässig.

**Welche ZUGFeRD-Profile gibt es?**
Die wichtigsten Profile sind MINIMUM, BASIC WL, BASIC, EN 16931 (Comfort) und EXTENDED. Für die gesetzliche E-Rechnungspflicht ist mindestens das Profil EN 16931 erforderlich.

---

*Verwandte Artikel: [XRechnung Pflicht 2025: Der vollständige Leitfaden](/blog/xrechnung-guide) · [DATEV-Export für Selbstständige](/blog/datev-export-fuer-selbststaendige) · [Buchhaltungssoftware für Kleinunternehmer](/blog/buchhaltungssoftware-kleinunternehmer)*
