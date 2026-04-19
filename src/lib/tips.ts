/** Static array of app tips ("Tipp des Tages") shown on the dashboard. */
export const APP_TIPS: string[] = [
  "Wusstest du? Du kannst im Kalender mit gedrückter Maus über einen Zeitraum ziehen, um schnell Zeit einzutragen.",
  "Doppelklick auf einen Zeiteintrag in der Liste macht ihn bearbeitbar.",
  "In den Einstellungen kannst du die Smart-Insights-Schwellwerte anpassen.",
  "Bei Angeboten wird die Rolle automatisch vom Produkt übernommen.",
  "Das Freigabe-Popup schlägt automatisch Mitarbeiter basierend auf Rollen vor.",
  "AI-Unternehmens-Setup: Beim Anlegen eines Unternehmens schlägt die AI branchenspezifische Rollen vor.",
  "Du kannst Rechnungen direkt als PDF exportieren — inklusive deinem Unternehmenslogo und Begleittext.",
  "Über den Kalender-Tab in der Zeiterfassung siehst du deine Woche auf einen Blick.",
  "Belege können per Kamera gescannt und automatisch erkannt werden — probier den Scan-Modus aus.",
  "Im Export-Bereich kannst du alle Rechnungen eines Zeitraums als ZIP herunterladen.",
  "Fixkosten werden automatisch monatlich umgerechnet, egal ob du sie monatlich, quartalsweise oder jährlich eingibst.",
  "Mit der Auswertung in der Zeiterfassung siehst du Billable- vs. Non-Billable-Stunden im Vergleich.",
  "Kunden können mehrere Ansprechpartner haben — nutze das Kontaktfeld für Details.",
  "Überfällige Rechnungen werden im Dashboard rot hervorgehoben, damit du sofort siehst, wo Handlungsbedarf ist.",
  "Du kannst den Begleittext für Rechnungen in Deutsch und Englisch pflegen — unter Einstellungen.",
  "Angebote lassen sich mit einem Klick in Rechnungen umwandeln.",
  "Die Smart Insights warnen dich automatisch, wenn ein Projekt sein Stundenbudget überschreitet.",
  "Im Spesen-Bereich kannst du Auslagen erfassen und nach Projekten zuordnen.",
  "Teilzahlungen werden unterstützt — eine Rechnung kann den Status 'teilbezahlt' haben.",
  "Du kannst zwischen Dark- und Light-Mode wechseln — in den Einstellungen unter Erscheinungsbild.",
  "Die Bankverbindung aus den Einstellungen wird automatisch auf jeder Rechnung angezeigt.",
  "Produkte mit hinterlegten Rollen sparen dir Zeit bei der Angebotserstellung.",
  "Du kannst die Gesellschaftsform (GmbH, OG, Verein) in den Einstellungen ändern — das beeinflusst die USt-Berechnung.",
  "Der Admin-Bereich zeigt alle Benutzer und deren Rollen auf einen Blick.",
];

/**
 * Returns the tip for today based on the day of the year,
 * cycling through all tips.
 */
export function getTipOfTheDay(): string {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  return APP_TIPS[dayOfYear % APP_TIPS.length];
}
