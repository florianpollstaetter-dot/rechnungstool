# Handover: Testversionen & Versions-Rollback im Paperclip/Mycel-System

**Von:** Florian (diktiert, zusammengefasst von Claude)
**Für:** Claude Code (Desktop App), Arbeit am Paperclip-System
**Datum:** 2026-08-05

> **WICHTIG — Vorgehen:** Bevor du mit der Implementierung beginnst, stelle Florian
> die offenen Fragen aus Abschnitt 5. Erst nach seinen Antworten planen und bauen.

---

## 1. Ausgangslage

Im Paperclip-System (erweitert um Mycel) arbeiten Mitarbeiter wie Willi an
Kunden-Seiten — Willi konkret an der Seite **Leadwords**. Wenn Willi heute eine
Korrektur eingibt, landet sie direkt auf der Live-Seite. Das soll sich ändern.

## 2. Feature A — Testversionen statt direkter Live-Änderung

Gewünschter Ablauf:

1. Willi nimmt eine Korrektur an seiner Seite (Leadwords) vor.
2. Die Korrektur geht **nicht** auf die Live-Seite, sondern nur auf eine
   **Testseite** (Preview/Staging-Version der Seite).
3. Willi schaut sich die Testseite an.
4. Wenn sie ihm gefällt, übernimmt er sie per Klick auf die Live-Seite
   („Live schalten" / Promote).

Zwei mögliche UI-Varianten (Entscheidung von Florian nötig, siehe Fragen):

- **Variante 1 — einfacher Schalter:** Willi hat einen Toggle „Testversion".
  Ist er aktiv, treffen alle Änderungen nur die (eine) Testversion.
- **Variante 2 — benannte Testversionen:** Willi kann beim Aktivieren der
  Testversion zusätzlich einen **Namen** für den Test vergeben. Das bedeutet:
  es kann **mehrere parallele Test-Stränge/Äste** (Branches) geben, die beim
  Anlegen automatisch erstellt werden — inklusive Logik, welcher Strang von
  welchem Stand abzweigt und wie er später in Live gemergt wird.

## 3. Feature B — Versionshistorie mit Rollback

- Unter der Seite soll eine **Versionsliste** sichtbar sein (prüfen: es
  existiert eventuell schon ein Ansatz für Versionen im System — erst
  Bestandsaufnahme machen, nichts doppelt bauen).
- Pro Version anzeigen: **online von `<Datum + Uhrzeit>` bis `<Datum + Uhrzeit>`**.
  Zweck: Man sieht sofort, wie lange eine Version live war → eine lange
  gelaufene Version war offensichtlich eine funktionierende Version.
- Pro Version ein Button/Schalter **„Auf diese Version zurückspringen"**
  (Rollback). Der Rollback selbst soll wieder als neue Version in der
  Historie erscheinen (Zeitraum-Logik muss konsistent bleiben).

## 4. Auftrag: Umbau-Analyse & Bug-Prävention

Bevor gebaut wird, soll durchdacht und dokumentiert werden:

1. **Was muss im Paperclip-System umgebaut werden**, damit Testversionen,
   benannte Stränge und die Versionshistorie sauber funktionieren
   (Datenmodell, Publishing-Flow, Berechtigungen, UI)?
2. **Risiko-Analyse „kaputte Version live":** Unter welchen Umständen könnte
   trotz allem eine kaputte Version online gehen (z. B. direkter Live-Edit am
   Testmodus vorbei, fehlerhafter Merge zweier Test-Stränge, Rollback auf eine
   Version mit inzwischen inkompatiblen Daten, gleichzeitige Änderungen von
   zwei Personen)? Für jedes Szenario eine Schutzmaßnahme vorschlagen
   (z. B. Preview-Pflicht vor dem Live-Schalten, Validierungs-/Build-Check,
   Konflikt-Erkennung, Bestätigungsdialog).
3. Ergebnis dieser Analyse Florian vorlegen, bevor implementiert wird.

## 5. Offene Fragen an Florian (vor Implementierungsstart klären)

1. **Mycel/Deployment:** Was genau ist „Mycel" technisch — euer eigenes
   Agenten-/Publishing-System, oder ist damit die Vercel-Anbindung gemeint?
   Wo wird die Leadwords-Seite gehostet/deployt?
2. **Repo/Ort:** In welchem Repository liegt der Code des Paperclip-Systems
   bzw. der Seiten-Editor, der umgebaut werden soll? (Im Rechnungstool-Repo
   ist nur der Paperclip-API-Client, nicht das System selbst.)
3. **Variante 1 oder 2:** Reicht ein einzelner Testversion-Schalter, oder
   sollen mehrere **benannte** Testversionen parallel möglich sein?
4. **Freigabe:** Darf Willi selbst live schalten, oder soll es einen
   Freigabe-Schritt geben (z. B. nur Florian/Admin darf promoten)?
5. **Umfang:** Betrifft das nur Inhalts-/Textkorrekturen an Seiten, oder auch
   strukturelle bzw. Code-Änderungen?
6. **Bestehende Versionierung:** Florian meint, es gebe schon etwas zum
   Zurückspringen auf Versionen — was existiert bereits und wo?
7. **Geltungsbereich:** Nur für Leadwords/Willi, oder von Anfang an für alle
   Seiten und alle Mitarbeiter im Paperclip-System?
