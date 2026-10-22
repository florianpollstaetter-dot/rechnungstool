// KIN-6527 — Einfache Abfragebremse pro Absender (IP) für das öffentliche
// UID-Prüf-Formular. Schutz gegen Skripte, die über unseren Server massenhaft
// VIES abfragen (VIES sperrt sonst unsere Adresse: MS_MAX_CONCURRENT_REQ).
//
// Zähler liegen im Arbeitsspeicher des laufenden Prozesses. Auf Vercel läuft
// jede Instanz getrennt, der Schutz ist also "pro Instanz" und nicht exakt —
// für ein kostenloses Formular reicht das, weil es Skripte um Größenordnungen
// bremst, ohne eine Datenbank oder Redis zu brauchen. Es wird NICHTS gespeichert
// außer Zeitstempeln pro IP, keine UID, kein Ergebnis.
//
// Reine Logik, Zeit injizierbar → testbar mit npx tsx tests/unit/kin6527-*.test.ts

export interface RateLimitOptions {
  /** Erlaubte Abfragen je Absender im Fenster. */
  maxProAbsender: number;
  /** Erlaubte Abfragen insgesamt (alle Absender) im Fenster — Schutz für VIES. */
  maxGesamt: number;
  /** Fensterlänge in Millisekunden. */
  fensterMs: number;
  /** Zeitquelle (für Tests). */
  jetzt?: () => number;
}

export interface RateLimitEntscheidung {
  erlaubt: boolean;
  /** Sekunden bis zur nächsten erlaubten Abfrage (nur wenn nicht erlaubt). */
  wartenSekunden?: number;
}

export class RateLimiter {
  private readonly proAbsender = new Map<string, number[]>();
  private gesamt: number[] = [];
  private readonly opts: Required<RateLimitOptions>;
  private letzteBereinigung = 0;

  constructor(opts: RateLimitOptions) {
    this.opts = { jetzt: () => Date.now(), ...opts };
  }

  /** Prüft und zählt eine Abfrage für `schluessel` (z. B. IP). */
  pruefe(schluessel: string): RateLimitEntscheidung {
    const t = this.opts.jetzt();
    const grenze = t - this.opts.fensterMs;
    this.bereinige(t);

    this.gesamt = this.gesamt.filter((x) => x > grenze);
    if (this.gesamt.length >= this.opts.maxGesamt) {
      return { erlaubt: false, wartenSekunden: this.warten(this.gesamt[0], t) };
    }

    const liste = (this.proAbsender.get(schluessel) ?? []).filter((x) => x > grenze);
    if (liste.length >= this.opts.maxProAbsender) {
      this.proAbsender.set(schluessel, liste);
      return { erlaubt: false, wartenSekunden: this.warten(liste[0], t) };
    }

    liste.push(t);
    this.proAbsender.set(schluessel, liste);
    this.gesamt.push(t);
    return { erlaubt: true };
  }

  private warten(aeltester: number, t: number): number {
    return Math.max(1, Math.ceil((aeltester + this.opts.fensterMs - t) / 1000));
  }

  /** Alte Absender vergessen, damit die Map nicht unbegrenzt wächst. */
  private bereinige(t: number) {
    if (t - this.letzteBereinigung < this.opts.fensterMs) return;
    this.letzteBereinigung = t;
    const grenze = t - this.opts.fensterMs;
    for (const [k, liste] of this.proAbsender) {
      const frisch = liste.filter((x) => x > grenze);
      if (frisch.length === 0) this.proAbsender.delete(k);
      else this.proAbsender.set(k, frisch);
    }
  }
}

/**
 * Absender-Adresse aus den Request-Headern. Vercel setzt `x-forwarded-for`
 * (erste Adresse = Client) und `x-real-ip`. Fällt auf "unbekannt" zurück —
 * dann teilen sich alle unbekannten Absender ein Kontingent (fail closed,
 * nicht fail open).
 */
export function absenderAusHeadern(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const erste = xff.split(",")[0]?.trim();
    if (erste) return erste;
  }
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  return "unbekannt";
}
