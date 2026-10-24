"use client";

// KIN-6650 — USt-Rechner, Baustein {{UST_RECHNER}}. Logik: src/lib/at-rechner/ust.ts

import { useId, useState } from "react";
import { berechneUst, UST_SAETZE, UST_SATZ_HINWEIS, UstFehler, type Richtung, type UstSatz } from "@/lib/at-rechner/ust";
import { euro, parseBetrag, prozent } from "@/lib/at-rechner/runden";
import { EINGABE_KLASSE, ErgebnisListe, ErgebnisZeile, FehlerText, Feld, Kleingedrucktes, ProduktHinweis, Quelle, RechnerRahmen } from "./RechnerUi";

export function UstRechner() {
  const id = useId();
  const [betrag, setBetrag] = useState("100,00");
  const [richtung, setRichtung] = useState<Richtung>("netto");
  const [satz, setSatz] = useState<UstSatz>(20);

  let fehler: string | null = null;
  let ergebnis: ReturnType<typeof berechneUst> | null = null;
  const b = parseBetrag(betrag);
  if (b == null) fehler = "Bitte einen Betrag eingeben, z. B. 1.250,00.";
  else {
    try {
      ergebnis = berechneUst(b, satz, richtung);
    } catch (e) {
      fehler = e instanceof UstFehler ? e.message : "Eingabe prüfen.";
    }
  }

  return (
    <RechnerRahmen
      id={id}
      titel="Umsatzsteuer berechnen: netto und brutto"
      hinweis="Rechnet direkt in deinem Browser. Es wird nichts gesendet oder gespeichert."
      testId="ust-rechner"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Feld id={`${id}-betrag`} label="Betrag" einheit="€">
          <input id={`${id}-betrag`} inputMode="decimal" autoComplete="off" value={betrag} onChange={(e) => setBetrag(e.target.value)} className={EINGABE_KLASSE} />
        </Feld>
        <fieldset>
          <legend className="block text-sm font-medium text-[var(--text-primary)] mb-1">Der Betrag ist</legend>
          <div className="flex gap-2">
            {(["netto", "brutto"] as const).map((r) => (
              <label
                key={r}
                className={`flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-lg border px-3 text-base ${
                  richtung === r
                    ? "border-[var(--brand-orange)] bg-[var(--brand-orange-dim)] font-semibold text-[var(--text-primary)]"
                    : "border-[var(--border)] text-[var(--text-secondary)]"
                }`}
              >
                <input type="radio" name={`${id}-richtung`} value={r} checked={richtung === r} onChange={() => setRichtung(r)} className="sr-only" />
                {r}
              </label>
            ))}
          </div>
        </fieldset>
        <Feld id={`${id}-satz`} label="Steuersatz" hilfe={UST_SATZ_HINWEIS[satz]}>
          <select id={`${id}-satz`} value={satz} onChange={(e) => setSatz(Number(e.target.value) as UstSatz)} className={EINGABE_KLASSE}>
            {UST_SAETZE.map((s) => (
              <option key={s} value={s}>
                {s === 0 ? "0 % (steuerfrei / Kleinunternehmer)" : prozent(s)}
              </option>
            ))}
          </select>
        </Feld>
      </div>

      <div aria-live="polite" aria-atomic="true" className="mt-4">
        {fehler && <FehlerText id={`${id}-fehler`} text={fehler} />}
        {ergebnis && (
          <>
            <ErgebnisListe>
              <ErgebnisZeile label="Netto" wert={euro(ergebnis.netto)} stark={richtung === "brutto"} />
              <ErgebnisZeile label={`Umsatzsteuer ${prozent(satz)}`} wert={euro(ergebnis.ust)} />
              <ErgebnisZeile label="Brutto" wert={euro(ergebnis.brutto)} stark={richtung === "netto"} />
            </ErgebnisListe>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              {richtung === "netto"
                ? `Rechnung: ${euro(ergebnis.netto)} × ${prozent(satz)} = ${euro(ergebnis.ust)} Umsatzsteuer.`
                : `Rechnung: ${euro(ergebnis.brutto)} ÷ ${(1 + satz / 100).toLocaleString("de-AT")} = ${euro(ergebnis.netto)} netto.`}
              {satz === 0 && " Kleinunternehmer weisen keine Umsatzsteuer aus und schreiben einen Hinweis auf die Befreiung auf die Rechnung."}
            </p>
          </>
        )}
      </div>

      <ProduktHinweis text="Orange Octo rechnet die Umsatzsteuer auf jeder Rechnung mit und zeigt dir die Summen für die Voranmeldung:" utmInhalt="ust-rechner" />

      <Kleingedrucktes>
        Steuersätze nach{" "}
        <Quelle href="https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10004873&Paragraf=10">§ 10 UStG</Quelle>
        , 4,9 % für ausgewählte Grundnahrungsmittel seit 1. Juli 2026 (
        <Quelle href="https://www.usp.gv.at/aktuelles/newsliste/neuer_ustsatz.html">USP</Quelle>). Die Umsatzsteuer
        meldest du in der Umsatzsteuervoranmeldung (UVA) über FinanzOnline. Stand: 24. Oktober 2026. Keine
        Steuerberatung.
      </Kleingedrucktes>
    </RechnerRahmen>
  );
}
