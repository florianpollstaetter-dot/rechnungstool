"use client";

// KIN-6650 — Verzugszinsen-Rechner, Baustein {{VERZUGSZINSEN_RECHNER}}. Logik: src/lib/at-rechner/verzugszinsen.ts

import { useId, useState } from "react";
import {
  berechneVerzugszinsen,
  MAHNPAUSCHALE_UGB,
  VERZUGSZINSEN_STAND,
  VerzugFehler,
  type Art,
} from "@/lib/at-rechner/verzugszinsen";
import { euro, parseBetrag, prozent } from "@/lib/at-rechner/runden";
import { EINGABE_KLASSE, ErgebnisListe, ErgebnisZeile, FehlerText, Feld, Kleingedrucktes, ProduktHinweis, Quelle, RechnerRahmen } from "./RechnerUi";

function datumAT(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export function VerzugszinsenRechner() {
  const id = useId();
  const [betrag, setBetrag] = useState("1.000,00");
  // Feste Beispieldaten statt „heute“: die Seite wird vorgerendert, ein
  // Tagesdatum würde beim Laden im Browser nicht zum HTML passen.
  const [faellig, setFaellig] = useState("2026-09-30");
  const [bezahlt, setBezahlt] = useState("2026-10-31");
  const [art, setArt] = useState<Art>("unternehmer");
  const [pauschale, setPauschale] = useState(true);

  let fehler: string | null = null;
  let ergebnis: ReturnType<typeof berechneVerzugszinsen> | null = null;
  const b = parseBetrag(betrag);
  if (b == null) fehler = "Bitte den offenen Betrag eingeben, z. B. 1.250,00.";
  else {
    try {
      ergebnis = berechneVerzugszinsen({ betrag: b, faelligAm: faellig, bezahltAm: bezahlt, art, mahnpauschale: pauschale });
    } catch (e) {
      fehler = e instanceof VerzugFehler ? e.message : "Eingabe prüfen.";
    }
  }

  return (
    <RechnerRahmen
      id={id}
      titel="Verzugszinsen berechnen"
      hinweis="Rechnet direkt in deinem Browser. Es wird nichts gesendet oder gespeichert."
      testId="verzugszinsen-rechner"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Feld id={`${id}-betrag`} label="Offener Betrag" einheit="€">
          <input id={`${id}-betrag`} inputMode="decimal" autoComplete="off" value={betrag} onChange={(e) => setBetrag(e.target.value)} className={EINGABE_KLASSE} />
        </Feld>
        <Feld id={`${id}-art`} label="Wer schuldet das Geld?">
          <select id={`${id}-art`} value={art} onChange={(e) => setArt(e.target.value as Art)} className={EINGABE_KLASSE}>
            <option value="unternehmer">ein Unternehmen (§ 456 UGB)</option>
            <option value="privat">eine Privatperson (§ 1000 ABGB)</option>
          </select>
        </Feld>
        <Feld id={`${id}-faellig`} label="Fällig am" hilfe="Zinsen laufen ab dem Tag danach">
          <input id={`${id}-faellig`} type="date" value={faellig} onChange={(e) => setFaellig(e.target.value)} className={EINGABE_KLASSE} />
        </Feld>
        <Feld id={`${id}-bezahlt`} label="Bezahlt am (oder heute)">
          <input id={`${id}-bezahlt`} type="date" value={bezahlt} onChange={(e) => setBezahlt(e.target.value)} className={EINGABE_KLASSE} />
        </Feld>
      </div>
      {art === "unternehmer" && (
        <label className="mt-3 flex min-h-11 items-center gap-2 text-sm text-[var(--text-primary)]">
          <input type="checkbox" checked={pauschale} onChange={(e) => setPauschale(e.target.checked)} className="h-5 w-5 accent-[var(--brand-orange)]" />
          {MAHNPAUSCHALE_UGB} € Pauschale für Mahnkosten dazurechnen (§ 458 UGB)
        </label>
      )}

      <div aria-live="polite" aria-atomic="true" className="mt-4">
        {fehler && <FehlerText id={`${id}-fehler`} text={fehler} />}
        {ergebnis && (
          <>
            <ErgebnisListe>
              {ergebnis.abschnitte.map((a) => (
                <ErgebnisZeile
                  key={a.von}
                  label={`${datumAT(a.von)} – ${datumAT(a.bis)}: ${a.tage} Tage × ${prozent(a.zinssatz)}${a.vorlaeufig ? "*" : ""}`}
                  wert={euro(a.zinsen)}
                />
              ))}
              <ErgebnisZeile label={`Verzugszinsen für ${ergebnis.tage} Tage`} wert={euro(ergebnis.zinsen)} stark />
              {ergebnis.pauschale > 0 && <ErgebnisZeile label="Pauschale Mahnkosten" wert={euro(ergebnis.pauschale)} />}
              <ErgebnisZeile label="Zusätzlich zum offenen Betrag" wert={euro(ergebnis.gesamt)} stark />
            </ErgebnisListe>
            {ergebnis.abschnitte.some((a) => a.vorlaeufig) && (
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                * Der Basiszinssatz für dieses Halbjahr steht noch nicht fest. Gerechnet mit dem heute geltenden Wert.
              </p>
            )}
          </>
        )}
      </div>

      <ProduktHinweis text="Offene Rechnungen sehen, Zahlungserinnerung mit einem Klick verschicken:" utmInhalt="verzugszinsen-rechner" />

      <Kleingedrucktes>
        Zwischen Unternehmen: 9,2 Prozentpunkte über dem Basiszinssatz der Nationalbank, maßgeblich ist der Wert am
        1. Jänner bzw. 1. Juli (
        <Quelle href="https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10001702&Paragraf=456">§ 456 UGB</Quelle>
        ; Basiszinssatz:{" "}
        <Quelle href="https://www.oenb.at/isawebstat/stabfrage/createReport?lang=DE&report=2.1">OeNB</Quelle>). Ist das
        Unternehmen am Verzug nicht schuld, nur 4 %. Gegenüber Privatpersonen 4 % im Jahr (
        <Quelle href="https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10001622&Paragraf=1000">§ 1000 ABGB</Quelle>
        ), wenn im Vertrag nichts anderes steht. Taggenau, 365 Tage im Jahr. Stand: {VERZUGSZINSEN_STAND}. Keine
        Rechtsberatung.
      </Kleingedrucktes>
    </RechnerRahmen>
  );
}
