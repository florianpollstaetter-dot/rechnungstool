import type { Metadata } from "next";
import { LEGAL_OPERATOR as L } from "@/lib/legal-config";

export const metadata: Metadata = {
  title: "Impressum — Orange Octo",
  description: "Informationspflicht nach § 5 ECG / § 25 Mediengesetz.",
};

export default function ImpressumPage() {
  return (
    <>
      <h1>Impressum</h1>
      <p>
        Informationspflicht laut § 5 E-Commerce-Gesetz (ECG), § 14
        Unternehmensgesetzbuch (UGB), § 63 Gewerbeordnung (GewO) und
        Offenlegungspflicht laut § 25 Mediengesetz.
      </p>

      <h2>Medieninhaber, Herausgeber und Diensteanbieter</h2>
      <p>
        <strong>{L.companyName}</strong>
        <br />
        {L.street}
        <br />
        {L.zip} {L.city}
        <br />
        {L.country}
      </p>
      <p>
        <strong>Rechtsform:</strong> {L.legalForm}
        <br />
        <strong>Firmenbuchnummer:</strong> {L.registerNumber}
        <br />
        <strong>Firmenbuchgericht:</strong> {L.registerCourt}
        <br />
        <strong>UID-Nummer:</strong> {L.uid}
        <br />
        <strong>Geschäftsführer:</strong> {L.managingDirector}
        <br />
        <strong>Unternehmensgegenstand:</strong> Entwicklung und Betrieb von
        Software- und Medienanwendungen, Erbringung von IT-Dienstleistungen
      </p>

      <h2>Kontakt</h2>
      <p>
        <strong>Telefon:</strong> {L.phone}
        <br />
        <strong>E-Mail:</strong>{" "}
        <a href={`mailto:${L.email}`}>{L.email}</a>
      </p>

      <h2>Produkt / Marke</h2>
      <p>
        Die unter dieser Domain betriebene Web-Anwendung „{L.product}&ldquo; ist eine
        interne Marke der {L.companyName} und dient der elektronischen
        Rechnungsverwaltung.
      </p>

      <h2>Gewerbebehörde / Aufsichtsbehörde</h2>
      <p>Magistratisches Bezirksamt des 23. Wiener Gemeindebezirks (Liesing)</p>

      <h2>Kammer- / Berufszugehörigkeit</h2>
      <p>
        Mitglied der Wirtschaftskammer Wien, Fachgruppe
        Unternehmensberatung, Buchhaltung und Informationstechnologie (UBIT)
      </p>

      <h2>Anwendbare Rechtsvorschriften</h2>
      <p>
        Gewerbeordnung 1994 (GewO) — abrufbar unter{" "}
        <a href="https://www.ris.bka.gv.at" target="_blank" rel="noopener noreferrer">
          ris.bka.gv.at
        </a>
      </p>

      <h2>Online-Streitbeilegung (EU-ODR)</h2>
      <p>
        Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung
        (OS) bereit:{" "}
        <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer">
          ec.europa.eu/consumers/odr
        </a>
        . Unsere E-Mail-Adresse: <a href={`mailto:${L.email}`}>{L.email}</a>.
      </p>
      <p>
        Wir sind weder bereit noch verpflichtet, an Streitbeilegungsverfahren
        vor einer Verbraucherschlichtungsstelle teilzunehmen.
      </p>

      <h2>Haftung für Inhalte</h2>
      <p>
        Die Inhalte dieser Anwendung wurden mit größtmöglicher Sorgfalt erstellt.
        Für die Richtigkeit, Vollständigkeit und Aktualität der Inhalte können
        wir jedoch keine Gewähr übernehmen. Als Diensteanbieter sind wir für
        eigene Inhalte nach den allgemeinen Gesetzen verantwortlich; gemäß §§
        13–17 ECG sind wir jedoch nicht verpflichtet, übermittelte oder
        gespeicherte fremde Informationen zu überwachen.
      </p>

      <h2>Haftung für Links</h2>
      <p>
        Unser Angebot enthält gegebenenfalls Links zu externen Websites Dritter,
        auf deren Inhalte wir keinen Einfluss haben. Für die Inhalte der
        verlinkten Seiten ist stets der jeweilige Anbieter verantwortlich. Bei
        Bekanntwerden von Rechtsverletzungen werden derartige Links umgehend
        entfernt.
      </p>

      <h2>Urheberrecht</h2>
      <p>
        Die durch den Seitenbetreiber erstellten Inhalte und Werke unterliegen
        dem österreichischen Urheberrecht. Vervielfältigung, Bearbeitung,
        Verbreitung und jede Art der Verwertung außerhalb der Grenzen des
        Urheberrechtes bedürfen der schriftlichen Zustimmung der {L.companyName}.
      </p>

      <p className="legal-meta">Stand: {L.legalDocsRevision}</p>
    </>
  );
}
