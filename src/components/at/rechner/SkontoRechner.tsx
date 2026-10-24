"use client";

// KIN-6650 — Skonto-Rechner, Baustein {{SKONTO_RECHNER}}. Logik: src/lib/at-rechner/skonto.ts

import { useId, useState } from "react";
import { berechneSkonto, SkontoFehler } from "@/lib/at-rechner/skonto";
import { euro, parseBetrag, prozent } from "@/lib/at-rechner/runden";
import { EINGABE_KLASSE, ErgebnisListe, ErgebnisZeile, FehlerText, Feld, Kleingedrucktes, ProduktHinweis, Quelle, RechnerRahmen } from "./RechnerUi";

export function SkontoRechner() {
  const id = useId();
  const [betrag, setBetrag] = useState("1.000,00");
  const [satz, setSatz] = useState("2");
  const [frist, setFrist] = useState("10");
  const [ziel, setZiel] = useState("30");
  const [ust, setUst] = useState("20");

  let fehler: string | null = null;
  let ergebnis: ReturnType<typeof berechneSkonto> | null = null;
  const b = parseBetrag(betrag);
  const s = parseBetrag(satz);
  const f = parseBetrag(frist);
  const z = parseBetrag(ziel);
  if (b == null || s == null || f == null || z == null) {
    fehler = "Bitte alle Felder mit Zahlen ausfüllen.";
  } else {
    try {
      ergebnis = berechneSkonto({ betrag: b, skontoProzent: s, skontoTage: f, zielTage: z, ustSatz: Number(ust) });
    } catch (e) {
      fehler = e instanceof SkontoFehler ? e.message : "Eingabe prüfen.";
    }
  }
  const fehlerId = `${id}-fehler`;

  return (
    <RechnerRahmen
      id={id}
      titel="Skonto berechnen"
      hinweis="Rechnet direkt in deinem Browser. Es wird nichts gesendet oder gespeichert."
      testId="skonto-rechner"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Feld id={`${id}-betrag`} label="Rechnungsbetrag brutto" einheit="€">
          <input id={`${id}-betrag`} inputMode="decimal" autoComplete="off" value={betrag} onChange={(e) => setBetrag(e.target.value)} className={EINGABE_KLASSE} aria-describedby={fehler ? fehlerId : undefined} />
        </Feld>
        <Feld id={`${id}-satz`} label="Skontosatz" einheit="%">
          <input id={`${id}-satz`} inputMode="decimal" autoComplete="off" value={satz} onChange={(e) => setSatz(e.target.value)} className={EINGABE_KLASSE} />
        </Feld>
        <Feld id={`${id}-frist`} label="Skontofrist" einheit="Tage">
          <input id={`${id}-frist`} inputMode="numeric" autoComplete="off" value={frist} onChange={(e) => setFrist(e.target.value)} className={EINGABE_KLASSE} />
        </Feld>
        <Feld id={`${id}-ziel`} label="Zahlungsziel ohne Skonto" einheit="Tage">
          <input id={`${id}-ziel`} inputMode="numeric" autoComplete="off" value={ziel} onChange={(e) => setZiel(e.target.value)} className={EINGABE_KLASSE} />
        </Feld>
        <Feld id={`${id}-ust`} label="Umsatzsteuer im Betrag" hilfe="Für die Buchhaltung: Skonto mindert auch die Umsatzsteuer.">
          <select id={`${id}-ust`} value={ust} onChange={(e) => setUst(e.target.value)} className={EINGABE_KLASSE}>
            <option value="20">20 %</option>
            <option value="13">13 %</option>
            <option value="10">10 %</option>
            <option value="4.9">4,9 %</option>
            <option value="0">keine (Kleinunternehmer)</option>
          </select>
        </Feld>
      </div>

      <div aria-live="polite" aria-atomic="true" className="mt-4">
        {fehler && <FehlerText id={fehlerId} text={fehler} />}
        {ergebnis && (
          <ErgebnisListe>
            <ErgebnisZeile label="Skontoabzug" wert={euro(ergebnis.skontoBetrag)} />
            <ErgebnisZeile label="Zu zahlen bei Skonto" wert={euro(ergebnis.zahlbetrag)} stark />
            {Number(ust) > 0 && (
              <ErgebnisZeile label={`davon Umsatzsteuer im Skonto`} wert={euro(ergebnis.ustImSkonto)} />
            )}
            <ErgebnisZeile
              label="Entspricht einem Jahreszins von"
              wert={ergebnis.effektiverJahreszins == null ? "–" : prozent(ergebnis.effektiverJahreszins)}
              stark
            />
          </ErgebnisListe>
        )}
        {ergebnis?.effektiverJahreszins != null && (
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Wer Skonto nicht nutzt, zahlt für {Number(ziel) - Number(frist)} Tage längeres Zahlungsziel umgerechnet{" "}
            {prozent(ergebnis.effektiverJahreszins)} Zinsen im Jahr. Ein Überziehungsrahmen ist fast immer billiger.
          </p>
        )}
      </div>

      <ProduktHinweis text="Skonto direkt auf die Rechnung schreiben und die Frist automatisch im Blick behalten:" utmInhalt="skonto-rechner" />

      <Kleingedrucktes>
        Formel: Skontosatz ÷ (100 − Skontosatz) × 360 ÷ (Zahlungsziel − Skontofrist). Skonto ist Vereinbarungssache,
        einen gesetzlichen Satz gibt es nicht. Ein Skontoabzug mindert die Bemessungsgrundlage der Umsatzsteuer (
        <Quelle href="https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10004873&Paragraf=16">
          § 16 UStG
        </Quelle>
        ). Keine Steuerberatung.
      </Kleingedrucktes>
    </RechnerRahmen>
  );
}
