import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_OPERATOR as L } from "@/lib/legal-config";

export const metadata: Metadata = {
  title: "Widerruf — Orange Octo",
  description:
    "Widerrufsbelehrung und Muster-Widerrufsformular für Verbraucher nach dem Fern- und Auswärtsgeschäfte-Gesetz (FAGG).",
};

const withdrawalForm = `Muster-Widerrufsformular

(Wenn Sie den Vertrag widerrufen wollen, füllen Sie bitte dieses Formular
aus und senden Sie es zurück.)

— An:

    ${L.companyName}
    ${L.street}
    ${L.zip} ${L.city}, ${L.country}
    E-Mail: ${L.email}

— Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen
  Vertrag über die Erbringung der folgenden Dienstleistung:

    Orange Octo — Web-Anwendung (SaaS-Abonnement)

— Bestellt am (*) / erhalten am (*): ________________

— Name des/der Verbraucher(s): ________________

— Anschrift des/der Verbraucher(s): ________________

— Unterschrift des/der Verbraucher(s)
  (nur bei Mitteilung auf Papier): ________________

— Datum: ________________

(*) Unzutreffendes streichen.`;

export default function WiderrufPage() {
  return (
    <>
      <h1>Widerrufsrecht für Verbraucher</h1>
      <p>
        <strong>Stand:</strong> {L.legalDocsRevision}
      </p>

      <h2>Widerrufsbelehrung</h2>
      <p>
        Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen
        diesen Vertrag zu widerrufen.
      </p>
      <p>
        Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des
        Vertragsabschlusses.
      </p>
      <p>Um Ihr Widerrufsrecht auszuüben, müssen Sie uns</p>
      <p>
        {L.companyName}
        <br />
        {L.street}, {L.zip} {L.city}, {L.country}
        <br />
        E-Mail: <a href={`mailto:${L.email}`}>{L.email}</a>
      </p>
      <p>
        mittels einer eindeutigen Erklärung (z.B. ein mit der Post versandter
        Brief oder eine E-Mail) über Ihren Entschluss, diesen Vertrag zu
        widerrufen, informieren. Sie können dafür das beigefügte
        Muster-Widerrufsformular verwenden, das jedoch nicht vorgeschrieben ist.
      </p>
      <p>
        Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung
        über die Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist
        absenden.
      </p>

      <h3>Folgen des Widerrufs</h3>
      <p>
        Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die
        wir von Ihnen erhalten haben, einschließlich der Lieferkosten (mit
        Ausnahme der zusätzlichen Kosten, die sich daraus ergeben, dass Sie eine
        andere Art der Lieferung als die von uns angebotene, günstigste
        Standardlieferung gewählt haben), unverzüglich und spätestens binnen
        vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über
        Ihren Widerruf dieses Vertrags bei uns eingegangen ist. Für diese
        Rückzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei der
        ursprünglichen Transaktion eingesetzt haben, es sei denn, mit Ihnen
        wurde ausdrücklich etwas anderes vereinbart; in keinem Fall werden Ihnen
        wegen dieser Rückzahlung Entgelte berechnet.
      </p>

      <h3>Erlöschen des Widerrufsrechts / Wertersatz bei Dienstleistungen</h3>
      <p>
        Haben Sie verlangt, dass die Dienstleistung während der Widerrufsfrist
        beginnen soll, so haben Sie uns einen angemessenen Betrag zu zahlen, der
        dem Anteil der bis zu dem Zeitpunkt, zu dem Sie uns von der Ausübung des
        Widerrufsrechts hinsichtlich dieses Vertrags unterrichten, bereits
        erbrachten Dienstleistungen im Vergleich zum Gesamtumfang der im Vertrag
        vorgesehenen Dienstleistungen entspricht (§ 16 FAGG).
      </p>
      <p>
        Das Widerrufsrecht erlischt bei einem Vertrag über die Erbringung von
        Dienstleistungen, wenn die Dienstleistung vollständig erbracht wurde und
        mit deren Ausführung erst begonnen wurde, nachdem Sie hierzu Ihre
        ausdrückliche Zustimmung erteilt und gleichzeitig Ihre Kenntnis davon
        bestätigt haben, dass Sie Ihr Widerrufsrecht bei vollständiger
        Vertragserfüllung durch den Anbieter verlieren (§ 18 Abs 1 Z 1 FAGG).
      </p>

      <h3>Kein Widerrufsrecht für Unternehmer</h3>
      <p>
        Für Unternehmer i.S.d. § 1 UGB gelten die Bestimmungen dieser
        Widerrufsbelehrung nicht. Der Vertrag ist für Unternehmer ohne
        Widerrufsrecht bindend; für die ordentliche Kündigung gilt § 10 der{" "}
        <Link href="/agb">AGB</Link> (jederzeitige Kündigung in Textform ohne
        Frist).
      </p>

      <h2>Muster-Widerrufsformular</h2>
      <p>
        Sie können das folgende Formular kopieren oder ausdrucken, ausfüllen und
        an uns zurücksenden. Die Verwendung ist nicht vorgeschrieben.
      </p>
      <pre
        style={{
          whiteSpace: "pre-wrap",
          fontFamily: "var(--font-mono, monospace)",
        }}
      >
        {withdrawalForm}
      </pre>

      <h2>Kontakt für Widerruf</h2>
      <p>
        {L.companyName}
        <br />
        {L.street}, {L.zip} {L.city}, {L.country}
        <br />
        E-Mail: <a href={`mailto:${L.email}`}>{L.email}</a>
      </p>

      <h2>Weitere Informationen</h2>
      <p>
        Details zur automatischen Verlängerung und zu Rückerstattungen finden
        Sie in <Link href="/agb#p11">§ 11 (Vergütung, Zahlungsbedingungen)</Link>{" "}
        und <Link href="/agb#p12">§ 12 (Widerrufsrecht) der AGB</Link>.
      </p>
    </>
  );
}
