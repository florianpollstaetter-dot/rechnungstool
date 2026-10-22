"use client";

// KIN-6527 — UID-Prüf-Formular (VIES) für die Ratgeberseiten /at/…
//
// Wiederverwendbare Client-Komponente. Einbinden z. B. in einer Seite:
//   import { UidPruefFormular } from "@/components/at/UidPruefFormular";
//   <UidPruefFormular />
// In Markdown-Ratgebern (content/at/*.md) genügt die Zeile {{UID_PRUEFFORMULAR}},
// src/app/at/[slug]/page.tsx setzt dort die Komponente ein.
//
// Ablauf: Land wählen + Nummer eingeben → Format wird lokal geprüft
// (src/lib/uid-pruefung/format.ts) → POST /api/at/uid-pruefen → Ergebnis
// "gültig", "ungültig" oder "VIES nicht erreichbar". Name/Anschrift nur, wenn
// VIES sie liefert. Es wird nichts gespeichert, keine Analytics-Events.
//
// Barrierefreiheit: echte <label>s, Fehler per aria-describedby + aria-invalid,
// Ergebnis in einer aria-live-Region, Fokus bleibt im Formular, Tastatur reicht.

import { useId, useState, type FormEvent } from "react";
import {
  UID_LAENDER,
  erkenneLandAusEingabe,
  findeUidLand,
  pruefeUidFormat,
} from "@/lib/uid-pruefung/format";
import type { UidPruefAntwort } from "@/lib/uid-pruefung/handler";

type Ergebnis =
  | { art: "gueltig"; daten: UidPruefAntwort }
  | { art: "ungueltig"; daten: UidPruefAntwort }
  | { art: "nicht_erreichbar"; daten: UidPruefAntwort }
  | { art: "fehler"; text: string };

export interface UidPruefFormularProps {
  /** Vorbelegtes Land (VIES-Kennung). Standard: AT. */
  standardLand?: string;
  /** Pfad der Server-Route — nur für Tests/Einbettung in anderen Apps ändern. */
  apiPfad?: string;
  /** Überschrift über dem Formular (h2). Leer lassen, wenn die Seite schon eine hat. */
  ueberschrift?: string;
}

function formatZeit(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Vienna",
  });
}

export function UidPruefFormular({
  standardLand = "AT",
  apiPfad = "/api/at/uid-pruefen",
  ueberschrift = "Jetzt prüfen: Ist die UID gültig?",
}: UidPruefFormularProps) {
  const id = useId();
  const landId = `${id}-land`;
  const nummerId = `${id}-nummer`;
  const fehlerId = `${id}-fehler`;
  const hinweisId = `${id}-hinweis`;

  const [land, setLand] = useState(findeUidLand(standardLand)?.code ?? "AT");
  const [nummer, setNummer] = useState("");
  const [formatFehler, setFormatFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [ergebnis, setErgebnis] = useState<Ergebnis | null>(null);

  const gewaehlt = findeUidLand(land);

  function onNummerChange(wert: string) {
    setNummer(wert);
    if (formatFehler) setFormatFehler(null);
    // "ATU…" komplett eingetippt → Land automatisch umstellen.
    const erkannt = erkenneLandAusEingabe(wert);
    if (erkannt && erkannt !== land) setLand(erkannt);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErgebnis(null);
    const format = pruefeUidFormat(land, nummer);
    if (!format.ok) {
      setFormatFehler(format.fehler);
      return;
    }
    setFormatFehler(null);
    setLaeuft(true);
    try {
      const res = await fetch(apiPfad, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ land: format.land, nummer: format.nummer }),
      });
      const json = (await res.json().catch(() => null)) as
        | (UidPruefAntwort & { fehler?: undefined })
        | { fehler: string; wartenSekunden?: number }
        | null;

      if (!json) {
        setErgebnis({ art: "fehler", text: "Die Prüfung hat keine Antwort geliefert. Bitte später noch einmal versuchen." });
        return;
      }
      if ("fehler" in json && typeof json.fehler === "string") {
        if (res.status === 400) setFormatFehler(json.fehler);
        else setErgebnis({ art: "fehler", text: json.fehler });
        return;
      }
      const daten = json as UidPruefAntwort;
      if (daten.status === "gueltig" || daten.status === "ungueltig" || daten.status === "nicht_erreichbar") {
        setErgebnis({ art: daten.status, daten });
      } else {
        setErgebnis({ art: "fehler", text: "Unerwartete Antwort. Bitte später noch einmal versuchen." });
      }
    } catch {
      setErgebnis({ art: "fehler", text: "Keine Verbindung zum Server. Bitte Internetverbindung prüfen und noch einmal versuchen." });
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <section
      aria-labelledby={ueberschrift ? `${id}-titel` : undefined}
      className="not-prose my-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6"
      data-testid="uid-pruef-formular"
    >
      {ueberschrift && (
        <h2 id={`${id}-titel`} className="text-lg font-semibold text-[var(--text-primary)] mb-1">
          {ueberschrift}
        </h2>
      )}
      <p id={hinweisId} className="text-sm text-[var(--text-secondary)] mb-4">
        Abfrage bei VIES, der offiziellen EU-Datenbank für UID-Nummern. Deine Eingabe wird nicht gespeichert.
      </p>

      <form onSubmit={onSubmit} noValidate aria-describedby={hinweisId} aria-busy={laeuft}>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,12rem)_1fr_auto] sm:items-end">
          <div>
            <label htmlFor={landId} className="block text-sm font-medium text-[var(--text-primary)] mb-1">
              Land
            </label>
            <select
              id={landId}
              name="land"
              value={land}
              onChange={(e) => {
                setLand(e.target.value);
                if (formatFehler) setFormatFehler(null);
              }}
              className="w-full min-h-11 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-base text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)]"
            >
              {UID_LAENDER.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.code} – {l.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={nummerId} className="block text-sm font-medium text-[var(--text-primary)] mb-1">
              UID-Nummer
            </label>
            <input
              id={nummerId}
              name="nummer"
              type="text"
              inputMode="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              value={nummer}
              onChange={(e) => onNummerChange(e.target.value)}
              placeholder={gewaehlt ? `${gewaehlt.code}${gewaehlt.beispiel}` : ""}
              aria-invalid={formatFehler ? true : undefined}
              aria-describedby={formatFehler ? fehlerId : undefined}
              required
              className="w-full min-h-11 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-base font-mono tracking-wide text-[var(--text-primary)] placeholder:text-[var(--text-muted)] placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)] aria-[invalid=true]:border-red-500"
            />
          </div>

          <button
            type="submit"
            disabled={laeuft}
            className="min-h-11 w-full sm:w-auto rounded-lg bg-[var(--brand-orange)] px-5 py-2 text-base font-semibold text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--brand-orange)] disabled:opacity-60 disabled:cursor-wait"
          >
            {laeuft ? "Wird geprüft …" : "UID prüfen"}
          </button>
        </div>

        {formatFehler && (
          <p id={fehlerId} role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
            {formatFehler}
          </p>
        )}
        {!formatFehler && gewaehlt && (
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Aufbau für {gewaehlt.name}: {gewaehlt.aufbau}. Leerzeichen und Bindestriche sind egal.
          </p>
        )}
      </form>

      <div aria-live="polite" aria-atomic="true" className="mt-4">
        {laeuft && (
          <p className="text-sm text-[var(--text-secondary)]">VIES wird abgefragt, das dauert meist unter 5 Sekunden …</p>
        )}
        {ergebnis && !laeuft && <ErgebnisKasten ergebnis={ergebnis} />}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-[var(--text-muted)]">
        Das Ergebnis ist eine einfache Bestätigung (Stufe 1): Es zeigt nur, ob die Nummer zum Zeitpunkt der Abfrage
        in VIES als gültig geführt wird. Es ist keine qualifizierte Bestätigung. Für die qualifizierte Bestätigung
        (Stufe 2) mit Abgleich von Name und Anschrift nutze{" "}
        <a
          href="https://finanzonline.bmf.gv.at/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline text-[var(--brand-orange)]"
        >
          FinanzOnline
        </a>
        . Für Betriebsprüfungen das Ergebnis mit Datum zu den Belegen nehmen. Quelle:{" "}
        <a
          href="https://ec.europa.eu/taxation_customs/vies/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline text-[var(--brand-orange)]"
        >
          VIES, Europäische Kommission
        </a>
        .
      </p>
    </section>
  );
}

function ErgebnisKasten({ ergebnis }: { ergebnis: Ergebnis }) {
  if (ergebnis.art === "fehler") {
    return (
      <div role="alert" className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-[var(--text-primary)]">
        <p className="font-semibold">Prüfung nicht möglich</p>
        <p>{ergebnis.text}</p>
      </div>
    );
  }

  const { daten } = ergebnis;
  const zeit = formatZeit(daten.geprueftAm);

  if (ergebnis.art === "gueltig") {
    return (
      <div className="rounded-lg border border-green-600/50 bg-green-600/10 p-3 text-sm text-[var(--text-primary)]" data-testid="uid-ergebnis-gueltig">
        <p className="font-semibold">
          <span aria-hidden="true">✔ </span>Gültig: {daten.uid}
        </p>
        <p className="text-[var(--text-secondary)]">
          VIES führt diese UID {zeit ? `am ${zeit} ` : ""}als gültig.
        </p>
        {daten.name || daten.adresse ? (
          <dl className="mt-2 grid gap-x-3 gap-y-1 sm:grid-cols-[auto_1fr]">
            {daten.name && (
              <>
                <dt className="text-[var(--text-secondary)]">Name</dt>
                <dd className="font-medium">{daten.name}</dd>
              </>
            )}
            {daten.adresse && (
              <>
                <dt className="text-[var(--text-secondary)]">Anschrift</dt>
                <dd className="whitespace-pre-line">{daten.adresse}</dd>
              </>
            )}
          </dl>
        ) : (
          <p className="mt-2 text-[var(--text-secondary)]">
            Name und Anschrift liefert VIES für dieses Land nicht. Das ist kein Hinweis auf ein Problem.
          </p>
        )}
      </div>
    );
  }

  if (ergebnis.art === "ungueltig") {
    return (
      <div className="rounded-lg border border-red-600/50 bg-red-600/10 p-3 text-sm text-[var(--text-primary)]" data-testid="uid-ergebnis-ungueltig">
        <p className="font-semibold">
          <span aria-hidden="true">✖ </span>Ungültig: {daten.uid}
        </p>
        <p className="text-[var(--text-secondary)]">
          VIES kennt diese Nummer {zeit ? `(Stand ${zeit}) ` : ""}nicht als gültige UID. Zuerst auf Tippfehler
          prüfen, dann beim Geschäftspartner nachfragen. Ohne gültige UID kannst du Steuerfreiheit oder Übergang
          der Steuerschuld in der Regel nicht ansetzen.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-[var(--text-primary)]" data-testid="uid-ergebnis-nicht-erreichbar">
      <p className="font-semibold">
        <span aria-hidden="true">⚠ </span>VIES ist gerade nicht erreichbar
      </p>
      <p className="text-[var(--text-secondary)]">
        Für {daten.uid} gab es keine Antwort. Das sagt nichts über die Nummer aus: Der Dienst des Ziellandes ist
        gerade offline oder überlastet. Bitte in ein paar Minuten noch einmal versuchen. Wenn es dringend ist,
        hilft die Abfrage in FinanzOnline.
      </p>
    </div>
  );
}

export default UidPruefFormular;
