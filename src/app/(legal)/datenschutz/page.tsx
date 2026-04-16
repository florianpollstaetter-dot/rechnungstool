import type { Metadata } from "next";
import { LEGAL_OPERATOR as L } from "@/lib/legal-config";

export const metadata: Metadata = {
  title: "Datenschutz — Orange Octo",
  description: "Datenschutzerklärung gemäß DSGVO / DSG / TKG.",
};

export default function DatenschutzPage() {
  return (
    <>
      <h1>Datenschutzerklärung</h1>
      <p>
        <strong>Verantwortlicher im Sinne von Art. 4 Z 7 DSGVO:</strong>
        <br />
        {L.companyName}
        <br />
        {L.street}, {L.zip} {L.city}, {L.country}
        <br />
        Telefon: {L.phone}
        <br />
        E-Mail: <a href={`mailto:${L.email}`}>{L.email}</a>
      </p>
      <p>
        <strong>Datenschutzkontakt:</strong>{" "}
        <a href={`mailto:${L.dsbEmail}`}>{L.dsbEmail}</a>
      </p>
      <p>
        <strong>Stand:</strong> {L.legalDocsRevision}
      </p>

      <h2>1. Überblick</h2>
      <p>
        Diese Erklärung informiert Sie darüber, welche personenbezogenen Daten
        wir bei der Nutzung unserer Web-Anwendung „{L.product}&ldquo; verarbeiten,
        zu welchen Zwecken, auf welcher Rechtsgrundlage, an welche Empfänger
        und welche Rechte Ihnen nach der Datenschutz-Grundverordnung (DSGVO),
        dem österreichischen Datenschutzgesetz (DSG) und dem
        Telekommunikationsgesetz 2021 (TKG) zustehen.
      </p>

      <h2>2. Umfang und Zwecke der Verarbeitung</h2>
      <h3>2.1 Zugangs- und Login-Daten</h3>
      <ul>
        <li>
          <strong>Daten:</strong> E-Mail-Adresse, Passwort-Hash, Rolle,
          Anzeige-Name, Log-in-Zeitpunkte, IP-Adresse und User-Agent zur
          Sicherung der Session.
        </li>
        <li>
          <strong>Zweck:</strong> Authentifizierung, Zugriffsschutz,
          Missbrauchserkennung.
        </li>
        <li>
          <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b DSGVO
          (Vertragserfüllung) sowie Art. 6 Abs. 1 lit. f DSGVO (berechtigtes
          Interesse an IT-Sicherheit).
        </li>
        <li>
          <strong>Speicherdauer:</strong> Für die Dauer des Nutzungsvertrages;
          Sicherheits-Logs längstens 12 Monate.
        </li>
      </ul>

      <h3>2.2 Stammdaten und Nutzungsdaten der Anwendung</h3>
      <ul>
        <li>
          <strong>Daten:</strong> Rechnungen, Angebote, Rechnungs- und
          Leistungspositionen, Kunden- und Lieferantenstammdaten (Name,
          Adresse, UID, E-Mail, Bankverbindung, Telefon),
          Produkte/Leistungsvorlagen, Bankbewegungen (Betrag, Datum,
          Buchungstext, IBAN, BIC), Belege (PDF/Bilddateien).
        </li>
        <li>
          <strong>Zweck:</strong> Erstellung, Verwaltung und Archivierung von
          Rechnungen und Angeboten; Abgleich mit Bankbewegungen;
          Belegverwaltung; Erfüllung steuer- und handelsrechtlicher
          Aufzeichnungspflichten.
        </li>
        <li>
          <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b DSGVO (Vertrag
          / vorvertragliche Maßnahmen), Art. 6 Abs. 1 lit. c DSGVO (rechtliche
          Verpflichtungen, insbesondere § 132 BAO, § 212 UGB,
          Rechnungslegungs- und Aufbewahrungspflichten).
        </li>
        <li>
          <strong>Speicherdauer:</strong> Bis zum Ablauf der gesetzlichen
          Aufbewahrungsfristen (in der Regel <strong>7 Jahre</strong> gem. §
          132 BAO, in bestimmten Fällen bis zu 22 Jahre bei
          Immobilien-bezogenen Unterlagen gem. § 18 Abs. 10 UStG).
        </li>
      </ul>

      <h3>2.3 KI-gestützte Belegauslesung</h3>
      <ul>
        <li>
          <strong>Daten:</strong> Inhalt hochgeladener Belege (Bilder/PDFs)
          einschließlich darin enthaltener personenbezogener Daten (z.B. Name,
          Adresse, IBAN von Lieferanten oder Kundschaft), dazugehörige
          Metadaten.
        </li>
        <li>
          <strong>Zweck:</strong> Automatisierte Auslesung strukturierter
          Felder (Betrag, Datum, Empfänger, USt) zur Vereinfachung der
          Belegerfassung.
        </li>
        <li>
          <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. f DSGVO
          (berechtigtes Interesse an effizienter Belegverarbeitung); soweit
          Gesundheits- oder sonstige besondere Kategorien enthalten sein
          könnten, wird der Nutzer angehalten, entsprechende Belege nicht
          hochzuladen.
        </li>
        <li>
          <strong>Empfänger/Auftragsverarbeiter:</strong> Anthropic, PBC, 548
          Market St, PMB 90375, San Francisco, CA 94104, USA („Claude API&ldquo;).
        </li>
        <li>
          <strong>Drittlandübermittlung:</strong> USA. Die Übermittlung erfolgt
          auf Basis der <strong>EU-Standardvertragsklauseln (SCC)</strong> der
          Europäischen Kommission (Durchführungsbeschluss 2021/914) und unter
          ergänzenden Schutzmaßnahmen (Verschlüsselung im Transit, Verbot der
          Nutzung zu Trainingszwecken gemäß Anthropic Commercial Terms).
        </li>
      </ul>

      <h3>2.4 Cookies, Local- und Session-Storage</h3>
      <p>
        Wir setzen <strong>technisch notwendige Cookies bzw. Browser-Storage-
        Einträge</strong> ein, die für Login, Session-Handhabung und Speicherung
        der aktiven Firmen- und Sprachauswahl erforderlich sind (insbesondere
        Supabase-Auth-Cookies, <code>activeCompanyId</code>,{" "}
        <code>currentUserName</code> im Local Storage).
      </p>
      <ul>
        <li>
          <strong>Rechtsgrundlage:</strong> § 165 Abs. 3 TKG 2021 iVm Art. 6
          Abs. 1 lit. f DSGVO (unbedingt erforderlich für den vom Nutzer
          gewünschten Dienst — <strong>keine Einwilligung erforderlich</strong>).
        </li>
        <li>
          <strong>Tracking, Werbung, Analyse-Cookies:</strong> werden{" "}
          <strong>nicht</strong> eingesetzt.
        </li>
        <li>
          <strong>Speicherdauer:</strong> Session- bzw. Login-Dauer;
          Auth-Cookies in der Regel bis zu 7 Tage (Refresh-Token).
        </li>
      </ul>

      <h3>2.5 Server-Logs (Hosting)</h3>
      <ul>
        <li>
          <strong>Daten:</strong> IP-Adresse, Zeitstempel, URL/Pfad,
          User-Agent, HTTP-Status, Referrer.
        </li>
        <li>
          <strong>Zweck:</strong> Sicherstellung des Betriebs, Missbrauchs- und
          Angriffsabwehr, Fehleranalyse.
        </li>
        <li>
          <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. f DSGVO
          (IT-Sicherheit, Funktionsfähigkeit).
        </li>
        <li>
          <strong>Speicherdauer:</strong> In der Regel bis zu 30 Tage, bei
          Sicherheitsvorfällen länger bis zur Aufklärung.
        </li>
      </ul>

      <h2>3. Empfänger und Auftragsverarbeiter</h2>
      <p>
        Wir setzen sorgfältig ausgewählte Dienstleister ein, mit denen
        Auftragsverarbeitungsverträge nach Art. 28 DSGVO abgeschlossen wurden:
      </p>
      <table>
        <thead>
          <tr>
            <th>Empfänger</th>
            <th>Zweck</th>
            <th>Sitz / Region</th>
            <th>Rechtsgrundlage Drittlandtransfer</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong>Supabase Inc.</strong>, 970 Toa Payoh North #07-04,
              Singapore 318992 (mit EU-Hosting über AWS/Frankfurt)
            </td>
            <td>Datenbank, Authentifizierung, Datei-Speicherung (Belege)</td>
            <td>USA/EU</td>
            <td>EU-SCC, EU-Region konfigurierbar; Supabase-DPA</td>
          </tr>
          <tr>
            <td>
              <strong>Vercel Inc.</strong>, 440 N Barranca Ave #4133, Covina,
              CA 91723, USA
            </td>
            <td>Hosting/Edge Delivery der Anwendung</td>
            <td>USA</td>
            <td>EU-SCC, Vercel-DPA</td>
          </tr>
          <tr>
            <td>
              <strong>Anthropic, PBC</strong>, San Francisco, CA, USA
            </td>
            <td>KI-gestützte Belegauslesung (Claude API)</td>
            <td>USA</td>
            <td>EU-SCC, Anthropic Commercial Terms (kein Training mit Kundendaten)</td>
          </tr>
          <tr>
            <td>Steuerberater*in, Wirtschaftsprüfer*in, Rechtsvertretung</td>
            <td>Erfüllung gesetzlicher Verpflichtungen, Rechtsverteidigung</td>
            <td>EU</td>
            <td>Art. 6 Abs. 1 lit. c / f DSGVO</td>
          </tr>
          <tr>
            <td>Behörden (Finanzamt, Gericht, Datenschutzbehörde)</td>
            <td>bei gesetzlicher Pflicht</td>
            <td>EU</td>
            <td>Art. 6 Abs. 1 lit. c DSGVO</td>
          </tr>
        </tbody>
      </table>
      <p>
        Eine Übermittlung an weitere Dritte findet nicht statt. Ein Verkauf
        personenbezogener Daten findet <strong>nicht</strong> statt.
      </p>

      <h2>4. Drittlandübermittlung</h2>
      <p>
        Bestimmte Auftragsverarbeiter (Anthropic, Vercel, ggf. Supabase) haben
        Unternehmenssitz in den USA. Die Übermittlung erfolgt auf Grundlage
        der <strong>Standardvertragsklauseln (SCC)</strong> gemäß
        Durchführungsbeschluss (EU) 2021/914, ergänzt durch technische und
        organisatorische Maßnahmen (insbesondere Transportverschlüsselung TLS
        1.2+, Zugangskontrolle, Pseudonymisierung, soweit möglich). Soweit
        Anbieter unter das <strong>EU-U.S. Data Privacy Framework (DPF)</strong>{" "}
        zertifiziert sind, stützen wir uns zusätzlich auf den
        Angemessenheitsbeschluss der Kommission vom 10.07.2023.
      </p>

      <h2>5. Automatisierte Entscheidungen, Profiling</h2>
      <p>
        Es findet <strong>keine</strong> automatisierte Entscheidung im
        Einzelfall einschließlich Profiling im Sinne von Art. 22 DSGVO statt.
        Die KI-gestützte Belegauslesung erzeugt <strong>Vorschläge</strong>;
        verbindliche Entscheidungen trifft stets ein menschlicher Nutzer.
      </p>

      <h2>6. Speicherdauer / Löschung</h2>
      <p>
        Wir speichern personenbezogene Daten nur so lange, wie dies für die
        genannten Zwecke erforderlich ist und keine gesetzlichen
        Aufbewahrungspflichten entgegenstehen. Nach Ablauf der
        Aufbewahrungspflicht werden die Daten routinemäßig gelöscht oder
        anonymisiert.
      </p>

      <h2>7. Ihre Rechte als Betroffene*r</h2>
      <p>
        Sie haben jederzeit — unentgeltlich und formlos per E-Mail an{" "}
        <a href={`mailto:${L.dsbEmail}`}>{L.dsbEmail}</a> oder{" "}
        <a href={`mailto:${L.email}`}>{L.email}</a> — folgende Rechte:
      </p>
      <ul>
        <li><strong>Auskunft</strong> (Art. 15 DSGVO)</li>
        <li><strong>Berichtigung</strong> (Art. 16 DSGVO)</li>
        <li>
          <strong>Löschung</strong> (Art. 17 DSGVO) — soweit keine gesetzliche
          Aufbewahrungspflicht besteht
        </li>
        <li><strong>Einschränkung der Verarbeitung</strong> (Art. 18 DSGVO)</li>
        <li><strong>Datenübertragbarkeit</strong> (Art. 20 DSGVO)</li>
        <li>
          <strong>Widerspruch</strong> gegen Verarbeitungen auf Basis
          berechtigter Interessen (Art. 21 DSGVO)
        </li>
        <li>
          <strong>Widerruf</strong> erteilter Einwilligungen mit Wirkung für die
          Zukunft (Art. 7 Abs. 3 DSGVO)
        </li>
      </ul>
      <p>
        Sie haben zudem das Recht, sich bei der{" "}
        <strong>österreichischen Datenschutzbehörde</strong> (Barichgasse 40-42,
        1030 Wien,{" "}
        <a href="https://www.dsb.gv.at" target="_blank" rel="noopener noreferrer">
          dsb.gv.at
        </a>
        ) zu beschweren (Art. 77 DSGVO).
      </p>

      <h2>8. Pflicht zur Bereitstellung</h2>
      <p>
        Die Bereitstellung der zur Authentifizierung und Rechnungsführung
        erforderlichen Daten ist für die Nutzung der Anwendung und zur
        Erfüllung gesetzlicher Aufzeichnungspflichten notwendig. Ohne diese
        Daten kann die Anwendung nicht bereitgestellt werden.
      </p>

      <h2>9. Sicherheit</h2>
      <p>
        Wir setzen technische und organisatorische Maßnahmen gemäß Art. 32
        DSGVO ein, insbesondere Transportverschlüsselung (TLS), verschlüsselte
        Datenspeicherung, rollenbasierte Zugriffskontrolle (RLS in Supabase),
        Passwort-Hashing, Protokollierung sicherheitsrelevanter Ereignisse
        sowie regelmäßige Updates.
      </p>

      <h2>10. Änderungen</h2>
      <p>
        Wir behalten uns vor, diese Datenschutzerklärung an aktuelle rechtliche
        und technische Entwicklungen anzupassen. Die jeweils aktuelle Version
        ist unter <code>/datenschutz</code> abrufbar.
      </p>

      <h2>11. Kontakt</h2>
      <p>
        Fragen zum Datenschutz richten Sie bitte an:
        <br />
        <strong>E-Mail:</strong>{" "}
        <a href={`mailto:${L.dsbEmail}`}>{L.dsbEmail}</a> (Fallback:{" "}
        <a href={`mailto:${L.email}`}>{L.email}</a>)
        <br />
        <strong>Post:</strong> {L.companyName}, Datenschutz, {L.street},{" "}
        {L.zip} {L.city}, {L.country}
      </p>
    </>
  );
}
