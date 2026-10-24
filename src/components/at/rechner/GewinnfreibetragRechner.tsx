"use client";

// KIN-6650 — Gewinnfreibetrag-Rechner, Baustein {{GFB_RECHNER}}. Logik: src/lib/at-rechner/gewinnfreibetrag.ts

import { useId, useState } from "react";
import { berechneGewinnfreibetrag, GFB_STAND } from "@/lib/at-rechner/gewinnfreibetrag";
import { euro, parseBetrag } from "@/lib/at-rechner/runden";
import { EINGABE_KLASSE, ErgebnisListe, ErgebnisZeile, FehlerText, Feld, Kleingedrucktes, Quelle, RechnerRahmen } from "./RechnerUi";

export function GewinnfreibetragRechner() {
  const id = useId();
  const [gewinn, setGewinn] = useState("53.000");
  const [invest, setInvest] = useState("2.000");
  const [pauschal, setPauschal] = useState(false);

  const g = parseBetrag(gewinn);
  const i = parseBetrag(invest || "0");
  const fehler = g == null || i == null ? "Bitte Gewinn und Investitionen als Zahl eingeben, z. B. 45.000." : null;
  const ergebnis = !fehler ? berechneGewinnfreibetrag({ gewinn: g!, investitionen: i!, pauschaliert: pauschal }) : null;

  return (
    <RechnerRahmen
      id={id}
      titel="Gewinnfreibetrag berechnen"
      hinweis="Rechnet direkt in deinem Browser. Es wird nichts gesendet oder gespeichert."
      testId="gfb-rechner"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Feld id={`${id}-gewinn`} label="Gewinn im Jahr" einheit="€" hilfe="Gewinn vor Gewinnfreibetrag">
          <input id={`${id}-gewinn`} inputMode="decimal" autoComplete="off" value={gewinn} onChange={(e) => setGewinn(e.target.value)} className={EINGABE_KLASSE} />
        </Feld>
        <Feld id={`${id}-invest`} label="Begünstigte Investitionen im selben Jahr" einheit="€" hilfe="Neue Anlagegüter ab 4 Jahren Nutzungsdauer oder bestimmte Wertpapiere">
          <input id={`${id}-invest`} inputMode="decimal" autoComplete="off" value={invest} onChange={(e) => setInvest(e.target.value)} className={EINGABE_KLASSE} disabled={pauschal} />
        </Feld>
      </div>
      <label className="mt-3 flex min-h-11 items-center gap-2 text-sm text-[var(--text-primary)]">
        <input type="checkbox" checked={pauschal} onChange={(e) => setPauschal(e.target.checked)} className="h-5 w-5 accent-[var(--brand-orange)]" />
        Ich ermittle den Gewinn pauschal (z. B. Basispauschalierung)
      </label>

      <div aria-live="polite" aria-atomic="true" className="mt-4">
        {fehler && <FehlerText id={`${id}-fehler`} text={fehler} />}
        {ergebnis && (
          <>
            <ErgebnisListe>
              <ErgebnisZeile label="Grundfreibetrag (automatisch)" wert={euro(ergebnis.grundfreibetrag)} />
              {!pauschal && <ErgebnisZeile label="Investitionsbedingter Teil" wert={euro(ergebnis.investitionsbedingt)} />}
              <ErgebnisZeile label="Gewinnfreibetrag gesamt" wert={euro(ergebnis.gesamt)} stark />
              <ErgebnisZeile label="Zu versteuernder Gewinn" wert={euro(ergebnis.steuerpflichtigerGewinn)} stark />
            </ErgebnisListe>
            {ergebnis.fehlendeInvestition > 0 && (
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Mit {euro(ergebnis.fehlendeInvestition)} mehr an begünstigten Investitionen bis 31. Dezember wäre der
                investitionsbedingte Teil voll ausgeschöpft ({euro(ergebnis.investitionsbedingtMoeglich)}).
              </p>
            )}
            {pauschal && (
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Bei pauschaler Gewinnermittlung steht nur der Grundfreibetrag zu.
              </p>
            )}
          </>
        )}
      </div>

      <Kleingedrucktes>
        15 % Grundfreibetrag für Gewinne bis 33.000 €, darüber 13 %, 7 % und 4,5 % gestaffelt, höchstens 46.400 €
        im Jahr (
        <Quelle href="https://www.wko.at/steuern/der-gewinnfreibetrag">WKO, Stand {GFB_STAND}</Quelle>;{" "}
        <Quelle href="https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10004570&Paragraf=10">§ 10 EStG</Quelle>
        ). Nur für natürliche Personen mit betrieblichen Einkünften. Näherung, keine Steuerberatung.
      </Kleingedrucktes>
    </RechnerRahmen>
  );
}
