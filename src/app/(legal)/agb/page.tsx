import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_OPERATOR as L } from "@/lib/legal-config";

export const metadata: Metadata = {
  title: "AGB — Orange Octo",
  description: "Allgemeine Geschäfts- und Nutzungsbedingungen.",
};

export default function AgbPage() {
  return (
    <>
      <h1>Allgemeine Geschäfts- und Nutzungsbedingungen</h1>
      <p>
        <strong>Anbieter:</strong> {L.companyName}, {L.street}, {L.zip} {L.city},{" "}
        {L.country} (nachfolgend „Anbieter&ldquo;)
        <br />
        <strong>Produkt:</strong> Web-Anwendung „{L.product}&ldquo; (nachfolgend
        „Anwendung&ldquo; oder „Dienst&ldquo;)
        <br />
        <strong>Stand:</strong> {L.legalDocsRevision}
      </p>

      <h2>1. Geltungsbereich</h2>
      <p>
        1.1 Diese Allgemeinen Geschäfts- und Nutzungsbedingungen (AGB) regeln
        die Nutzung der Anwendung durch natürliche und juristische Personen,
        denen vom Anbieter ein Zugang eingerichtet wurde (nachfolgend „Nutzer&ldquo;).
      </p>
      <p>
        1.2 Die Anwendung ist primär für den internen, konzerninternen bzw.
        auftragsbezogenen Einsatz durch den Anbieter und von ihm autorisierte
        Dritte bestimmt. Eine öffentliche Registrierung ist nicht vorgesehen.
      </p>
      <p>
        1.3 Entgegenstehende, ergänzende oder abweichende Bedingungen des
        Nutzers werden nicht anerkannt, es sei denn, der Anbieter hat ihrer
        Geltung ausdrücklich schriftlich zugestimmt.
      </p>
      <p>
        1.4 Der Anbieter ist berechtigt, diese AGB mit einer Ankündigungsfrist
        von vier Wochen zu ändern. Die Änderungen gelten als genehmigt, wenn der
        Nutzer ihnen nicht binnen dieser Frist in Textform widerspricht.
      </p>

      <h2>2. Vertragsschluss, Zugang</h2>
      <p>
        2.1 Der Nutzungsvertrag kommt mit Einrichtung des Zugangs durch den
        Anbieter zustande. Der Zugang ist persönlich und nicht übertragbar.
      </p>
      <p>
        2.2 Der Nutzer ist verpflichtet, seine Zugangsdaten vertraulich zu
        behandeln und vor dem Zugriff Dritter zu schützen. Jeder Verdacht auf
        Missbrauch ist unverzüglich an{" "}
        <a href={`mailto:${L.email}`}>{L.email}</a> zu melden.
      </p>
      <p>
        2.3 Der Anbieter ist berechtigt, Zugänge jederzeit zu deaktivieren oder
        zurückzuziehen, insbesondere bei Verstößen gegen diese AGB, bei
        Missbrauchsverdacht oder aus betrieblichen/rechtlichen Gründen.
      </p>

      <h2>3. Leistungsumfang</h2>
      <p>
        3.1 Die Anwendung stellt Funktionen zur elektronischen
        Rechnungserstellung, Angebotsverwaltung, Kundenstammdatenverwaltung,
        Belegerfassung (einschließlich KI-gestützter Auslesung) sowie
        Bankabgleich zur Verfügung.
      </p>
      <p>
        3.2 Der Anbieter behält sich vor, Funktionen, Umfang und Design der
        Anwendung jederzeit weiterzuentwickeln, einzuschränken oder
        einzustellen, sofern dadurch der Hauptnutzungszweck nicht dauerhaft
        vereitelt wird.
      </p>
      <p>
        3.3 <strong>Die Anwendung ersetzt keine steuer-, wirtschafts- oder
        buchhaltungsrechtliche Beratung.</strong>{" "}
        Die rechtliche Prüfung von Rechnungen, Angeboten und Buchhaltungsdaten
        obliegt ausschließlich dem Nutzer bzw. dessen Steuerberater.
      </p>

      <h2>4. Verfügbarkeit, kein SLA</h2>
      <p>
        4.1 Der Anbieter bemüht sich um eine möglichst hohe Verfügbarkeit der
        Anwendung,{" "}
        <strong>
          schuldet jedoch keine bestimmte Verfügbarkeit, keine 24/7-Erreichbarkeit,
          keine Reaktionszeiten und keine Wiederherstellungszeiten
        </strong>{" "}
        („kein Service Level Agreement&ldquo;).
      </p>
      <p>
        4.2 Wartungsarbeiten, Updates, Migrationen, Infrastruktur-Ausfälle der
        eingesetzten Subunternehmer (insbesondere Hosting-Anbieter,
        Datenbank-Anbieter, KI-Dienste) sowie Ereignisse höherer Gewalt
        berechtigen nicht zur Minderung, Kündigung oder Schadenersatz.
      </p>
      <p>
        4.3 Der Anbieter kann Betrieb und Zugang jederzeit, auch ohne
        Vorankündigung, unterbrechen, wenn dies aus Sicherheits-, Integritäts-
        oder Betriebsgründen erforderlich erscheint.
      </p>

      <h2>5. Nutzungsrechte</h2>
      <p>
        5.1 Der Nutzer erhält ein einfaches, nicht übertragbares, nicht
        unterlizenzierbares, widerrufliches Recht, die Anwendung im Rahmen
        dieser AGB und im Rahmen des ihm zugewiesenen Zugangs zu nutzen.
      </p>
      <p>
        5.2 Sämtliche Rechte an der Anwendung, deren Quellcode, deren Design,
        deren Datenmodellen und allen abgeleiteten Werken stehen ausschließlich
        dem Anbieter zu. Reverse Engineering, Dekompilierung, das Abgreifen der
        Datenbank über Scraping sowie das Umgehen technischer Schutzmaßnahmen
        sind untersagt.
      </p>
      <p>
        5.3 Der Nutzer darf die Anwendung nicht dazu verwenden, Rechte Dritter
        zu verletzen, Spam, Schadsoftware, rechtswidrige oder sittenwidrige
        Inhalte zu verbreiten oder die Anwendung in einer Weise zu belasten,
        die ihren Betrieb beeinträchtigt.
      </p>

      <h2>6. Pflichten und Verantwortlichkeiten des Nutzers</h2>
      <p>6.1 Der Nutzer ist ausschließlich verantwortlich für</p>
      <ul>
        <li>
          die inhaltliche Richtigkeit, Vollständigkeit und Rechtmäßigkeit aller
          von ihm eingegebenen, hochgeladenen oder über Schnittstellen
          bereitgestellten Daten (insbesondere Rechnungen, Angebote, Kundendaten,
          Belege, Bankdaten);
        </li>
        <li>
          die Einhaltung seiner steuer-, handels-, sozialversicherungs- und
          aufbewahrungsrechtlichen Pflichten;
        </li>
        <li>
          die rechtzeitige Sicherung seiner Daten in seiner eigenen Infrastruktur
          (eigenständige Backups);
        </li>
        <li>
          die datenschutzkonforme Verarbeitung personenbezogener Daten seiner
          Kunden, Lieferanten und Mitarbeiter, einschließlich der Erfüllung
          allfälliger Informationspflichten gegenüber Betroffenen.
        </li>
      </ul>
      <p>
        6.2 Der Nutzer stellt den Anbieter von sämtlichen Ansprüchen Dritter
        frei, die darauf beruhen, dass der Nutzer gegen diese Pflichten
        verstößt.
      </p>

      <h2>7. KI-gestützte Belegauslesung</h2>
      <p>
        7.1 Zur Unterstützung bei der Erfassung von Belegen nutzt die Anwendung
        Dienste künstlicher Intelligenz (derzeit Anthropic Claude, USA). Die
        Ergebnisse der automatisierten Auslesung sind{" "}
        <strong>unverbindliche Vorschläge</strong>; eine Verantwortung für
        deren Richtigkeit wird nicht übernommen. Eine Überprüfung durch den
        Nutzer ist zwingend erforderlich.
      </p>
      <p>
        7.2 Der Nutzer stellt sicher, dass die von ihm hochgeladenen Belege an
        einen KI-Dienst in einem Drittland übermittelt werden dürfen und dass
        er hierfür bei Bedarf eigene Rechtsgrundlagen und Einwilligungen
        vorhält.
      </p>

      <h2>8. Haftung — Haftungsausschluss und -beschränkung</h2>
      <p>
        8.1 Der Anbieter haftet unbeschränkt für Vorsatz, grobe Fahrlässigkeit
        sowie für Personenschäden im Rahmen zwingender gesetzlicher Bestimmungen
        und nach dem Produkthaftungsgesetz.
      </p>
      <p>
        8.2 Für leichte Fahrlässigkeit ist die Haftung für Sach- und
        Vermögensschäden <strong>ausgeschlossen</strong>, soweit nicht eine
        wesentliche Vertragspflicht (Kardinalpflicht) verletzt wurde. Im Falle
        der Verletzung einer Kardinalpflicht aus leichter Fahrlässigkeit ist
        die Haftung auf den vertragstypischen, vorhersehbaren Schaden, maximal
        jedoch auf € 1.000,- pro Schadensfall begrenzt.
      </p>
      <p>
        8.3 <strong>Der Anbieter haftet nicht für</strong>
      </p>
      <ul>
        <li>
          Datenverluste, Datenbeschädigung oder unvollständige Daten, sofern
          der Nutzer nicht nachweist, dass der Schaden auch bei Vorhalten eines
          zumutbaren, aktuellen Backups eingetreten wäre;
        </li>
        <li>
          entgangenen Gewinn, Produktionsausfälle, Folgekosten einer
          verspäteten oder fehlerhaften Rechnungslegung, Säumniszuschläge,
          steuerliche Nachteile, Zinsen oder Bußgelder, die aus der Nutzung
          oder Nichtverfügbarkeit der Anwendung resultieren;
        </li>
        <li>
          Fehlleistungen eingesetzter Subunternehmer (insbesondere Cloud-,
          Datenbank- und KI-Anbieter), sofern diese sorgfältig ausgewählt
          wurden;
        </li>
        <li>
          Schäden aus der Verletzung von Nutzerpflichten nach Ziffer 6 (z.B.
          fehlerhafte Dateneingabe, Missbrauch von Zugangsdaten);
        </li>
        <li>
          Schäden aus rechtswidrigem Zugriff Dritter (z.B. Hackerangriffe),
          sofern der Anbieter dem Stand der Technik entsprechende
          Sicherheitsmaßnahmen eingehalten hat;
        </li>
        <li>Schäden aus Ereignissen höherer Gewalt.</li>
      </ul>
      <p>
        8.4 Die Haftungsbeschränkungen gelten zugunsten der gesetzlichen
        Vertreter, Erfüllungsgehilfen und Mitarbeiter des Anbieters
        entsprechend.
      </p>

      <h2>9. Datenschutz</h2>
      <p>
        Die Verarbeitung personenbezogener Daten richtet sich nach der{" "}
        <Link href="/datenschutz">Datenschutzerklärung</Link> und den
        einschlägigen datenschutzrechtlichen Bestimmungen (DSGVO, DSG).
      </p>

      <h2>10. Vertragsdauer, Kündigung</h2>
      <p>
        10.1 Der Nutzungsvertrag läuft auf unbestimmte Zeit und kann von beiden
        Seiten jederzeit ohne Einhaltung einer Frist in Textform (E-Mail genügt)
        gekündigt werden.
      </p>
      <p>
        10.2 Das Recht zur außerordentlichen Kündigung aus wichtigem Grund
        bleibt unberührt. Ein wichtiger Grund für den Anbieter liegt
        insbesondere vor bei erheblichen oder wiederholten Verstößen gegen diese
        AGB sowie bei begründetem Missbrauchsverdacht.
      </p>
      <p>
        10.3 Nach Beendigung werden die Zugänge deaktiviert. Die Löschung von
        Daten richtet sich nach der Datenschutzerklärung und den geltenden
        Aufbewahrungspflichten (z.B. § 132 BAO, § 212 UGB).
      </p>

      <h2>11. Salvatorische Klausel</h2>
      <p>
        Sollten einzelne Bestimmungen dieser AGB unwirksam oder undurchsetzbar
        sein oder werden, bleibt die Wirksamkeit der übrigen Bestimmungen
        unberührt. An die Stelle der unwirksamen Bestimmung tritt eine
        Regelung, die dem wirtschaftlichen Zweck der unwirksamen Bestimmung
        möglichst nahekommt.
      </p>

      <h2>12. Anwendbares Recht, Gerichtsstand</h2>
      <p>
        12.1 Es gilt österreichisches Recht unter Ausschluss des UN-Kaufrechts
        und der Verweisungsnormen des Internationalen Privatrechts.
      </p>
      <p>
        12.2 Ausschließlicher Gerichtsstand für alle Streitigkeiten aus oder im
        Zusammenhang mit diesem Vertrag ist — soweit gesetzlich zulässig — das
        sachlich zuständige Gericht in <strong>1010 Wien, Österreich</strong>.
      </p>
      <p>
        12.3 Verbraucher im Sinne des KSchG können Klagen auch an ihrem
        allgemeinen Gerichtsstand einbringen; zwingende
        verbraucherschutzrechtliche Bestimmungen bleiben unberührt.
      </p>

      <h2>13. Kontakt</h2>
      <p>
        {L.companyName}
        <br />
        {L.street}, {L.zip} {L.city}, {L.country}
        <br />
        E-Mail: <a href={`mailto:${L.email}`}>{L.email}</a>
      </p>
    </>
  );
}
