"use client";

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  Font,
} from "@react-pdf/renderer";
import { ExpenseReport, ExpenseItem, CompanySettings } from "@/lib/types";

Font.register({
  family: "Inter",
  fonts: [
    { src: "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf", fontWeight: 400 },
    { src: "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYMZg.ttf", fontWeight: 600 },
    { src: "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf", fontWeight: 700 },
  ],
});

const c = {
  black: "#0A0A0A",
  accent: "#C9A84C",
  white: "#FFFFFF",
  grayLight: "#F7F7F7",
  grayMid: "#AAAAAA",
  grayDark: "#444444",
  border: "#E0E0E0",
};

const CATEGORY_LABELS: Record<string, string> = {
  travel: "Reisekosten",
  meals: "Bewirtung",
  office: "Büromaterial",
  transport: "Transport/Fahrt",
  telecom: "Telefon/Internet",
  software: "Software/Lizenzen",
  other: "Sonstiges",
};

const PAYMENT_LABELS: Record<string, string> = {
  bar: "Bar",
  karte: "Karte (privat)",
  firmenkarte: "Unternehmenskarte",
  ueberweisung: "Überweisung",
  paypal: "PayPal",
  sonstige: "Sonstige",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Entwurf",
  submitted: "Eingereicht",
  approved: "Genehmigt",
  rejected: "Abgelehnt",
  booked: "Gebucht",
};

const s = StyleSheet.create({
  page: { paddingTop: 45, paddingBottom: 80, paddingLeft: 50, paddingRight: 50, fontFamily: "Inter", fontSize: 9.5, color: c.grayDark },
  goldBar: { position: "absolute", top: 0, left: 0, width: 4, height: "100%", backgroundColor: c.accent },

  /* Header */
  header: { flexDirection: "row", justifyContent: "space-between", paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: c.accent },
  logo: { width: 130, height: 55, objectFit: "contain" },
  companyName: { fontWeight: 600, fontSize: 9, color: c.black, marginTop: 8 },
  companyAddr: { fontSize: 8, color: "#888888", lineHeight: 1.5 },
  headerRight: { textAlign: "right" },
  title: { fontSize: 24, fontWeight: 700, color: c.black, textAlign: "right" },
  goldUnderline: { borderBottomWidth: 2, borderBottomColor: c.accent, width: "80%", alignSelf: "flex-end", marginBottom: 10 },

  /* Meta */
  metaRow: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 3 },
  metaLabel: { fontSize: 8, color: c.grayMid, textTransform: "uppercase", letterSpacing: 0.8, marginRight: 8, width: 110, textAlign: "right" },
  metaValue: { fontSize: 9.5, fontWeight: 600, color: c.black, width: 110, textAlign: "right" },

  /* Employee box */
  employeeBox: { backgroundColor: c.grayLight, borderLeftWidth: 3, borderLeftColor: c.accent, padding: 12, marginTop: 20, marginBottom: 20, width: "50%" },
  employeeLabel: { fontSize: 7.5, color: c.grayMid, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  employeeName: { fontSize: 10, fontWeight: 600, color: c.black },

  /* Table */
  tableHeader: { flexDirection: "row", backgroundColor: c.black, paddingVertical: 7, paddingHorizontal: 8 },
  tableHeaderText: { color: c.white, fontSize: 7.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 },
  tableRow: { flexDirection: "row", paddingVertical: 7, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: c.border },
  tableRowEven: { backgroundColor: c.grayLight },
  colPos: { width: 25, textAlign: "center" },
  colDate: { width: 60 },
  colIssuer: { width: 90 },
  colPurpose: { width: 90 },
  colCategory: { width: 65 },
  colGross: { width: 65, textAlign: "right" },
  colVat: { width: 55, textAlign: "right" },
  colPayment: { width: 50 },
  cellBold: { fontWeight: 600, color: c.black, fontSize: 8.5 },
  cellNormal: { color: c.grayDark, fontSize: 8.5 },

  /* Summary */
  summaryBox: { alignSelf: "flex-end", width: 230, marginTop: 20 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: c.border },
  summaryLabel: { fontSize: 9, color: c.grayDark },
  summaryValue: { fontSize: 9, color: c.black, fontWeight: 600 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, backgroundColor: c.black, paddingHorizontal: 8 },
  totalLabel: { fontSize: 11, fontWeight: 700, color: c.white },
  totalValue: { fontSize: 11, fontWeight: 700, color: c.white },

  /* Footer */
  footer: { position: "absolute", bottom: 30, left: 50, right: 50, borderTopWidth: 0.5, borderTopColor: c.accent, paddingTop: 10 },
  footerTop: { flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: c.grayMid },
  footerColHeader: { fontWeight: 600, color: c.black, marginBottom: 3, fontSize: 7.5 },
  footerCol: { lineHeight: 1.5 },
  pageNumber: { position: "absolute", bottom: 15, right: 50, fontSize: 7.5, color: c.grayMid },

  /* Receipt appendix */
  receiptPageTitle: { fontSize: 16, fontWeight: 700, color: c.black, marginBottom: 4 },
  receiptSubtitle: { fontSize: 9, color: c.grayDark, marginBottom: 16 },
  receiptImage: { maxWidth: "100%", maxHeight: 620, objectFit: "contain" },
  receiptMeta: { fontSize: 8, color: c.grayMid, marginTop: 8 },

  /* Notes */
  notesBox: { marginTop: 18, borderLeftWidth: 3, borderLeftColor: c.accent, paddingLeft: 10, backgroundColor: "#FEFDF5", padding: 12, fontSize: 9, color: c.grayDark, lineHeight: 1.6, fontStyle: "italic" },
});

function fmtEuro(n: number): string {
  return n.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " \u20AC";
}

function fmtDate(date: string): string {
  const d = new Date(date);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

function fmtMonth(month: string): string {
  const [y, m] = month.split("-");
  const months = ["Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  return `${months[parseInt(m, 10) - 1]} ${y}`;
}

export interface ReceiptImageData {
  itemId: string;
  dataUrl: string;
  label: string;
}

interface Props {
  report: ExpenseReport;
  items: ExpenseItem[];
  settings: CompanySettings;
  receiptImages: ReceiptImageData[];
}

export default function ExpenseReportPDF({ report, items, settings, receiptImages }: Props) {
  const sortedItems = [...items].sort((a, b) => a.date.localeCompare(b.date));
  const totalGross = sortedItems.reduce((s, i) => s + i.amount_gross, 0);
  const totalVat = sortedItems.reduce((s, i) => s + i.amount_vat, 0);
  const totalNet = sortedItems.reduce((s, i) => s + i.amount_net, 0);

  return (
    <Document>
      {/* Main report page */}
      <Page size="A4" style={s.page}>
        <View style={s.goldBar} fixed />

        {/* Header */}
        <View style={s.header}>
          <View>
            {settings.logo_url ? <Image src={settings.logo_url} style={s.logo} /> : null}
            <Text style={s.companyName}>{settings.company_name}</Text>
            <Text style={s.companyAddr}>{settings.address}</Text>
            <Text style={s.companyAddr}>{settings.zip} {settings.city}</Text>
            <Text style={s.companyAddr}>{settings.uid}</Text>
          </View>
          <View style={s.headerRight}>
            <Text style={s.title}>Spesenabrechnung</Text>
            <View style={s.goldUnderline} />
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Berichtsnummer</Text>
              <Text style={s.metaValue}>{report.report_number || "—"}</Text>
            </View>
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Zeitraum</Text>
              <Text style={s.metaValue}>{fmtMonth(report.period_month)}</Text>
            </View>
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Status</Text>
              <Text style={s.metaValue}>{STATUS_LABELS[report.status] || report.status}</Text>
            </View>
            {report.submitted_at && (
              <View style={s.metaRow}>
                <Text style={s.metaLabel}>Eingereicht am</Text>
                <Text style={s.metaValue}>{fmtDate(report.submitted_at)}</Text>
              </View>
            )}
            {report.approved_by && report.approved_at && (
              <View style={s.metaRow}>
                <Text style={s.metaLabel}>Genehmigt von</Text>
                <Text style={s.metaValue}>{report.approved_by}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Employee */}
        <View style={s.employeeBox}>
          <Text style={s.employeeLabel}>Mitarbeiter</Text>
          <Text style={s.employeeName}>{report.user_name}</Text>
        </View>

        {/* Items table */}
        <View style={s.tableHeader}>
          <Text style={[s.tableHeaderText, s.colPos]}>Nr.</Text>
          <Text style={[s.tableHeaderText, s.colDate]}>Datum</Text>
          <Text style={[s.tableHeaderText, s.colIssuer]}>Lieferant</Text>
          <Text style={[s.tableHeaderText, s.colPurpose]}>Zweck</Text>
          <Text style={[s.tableHeaderText, s.colCategory]}>Kategorie</Text>
          <Text style={[s.tableHeaderText, s.colGross]}>Brutto</Text>
          <Text style={[s.tableHeaderText, s.colVat]}>USt</Text>
          <Text style={[s.tableHeaderText, s.colPayment]}>Zahlung</Text>
        </View>
        {sortedItems.map((item, idx) => (
          <View key={item.id} style={[s.tableRow, idx % 2 === 1 ? s.tableRowEven : {}]} wrap={false}>
            <Text style={[s.cellNormal, s.colPos]}>{idx + 1}</Text>
            <Text style={[s.cellNormal, s.colDate]}>{fmtDate(item.date)}</Text>
            <Text style={[s.cellBold, s.colIssuer]}>{item.issuer || "—"}</Text>
            <Text style={[s.cellNormal, s.colPurpose]}>{item.purpose || "—"}</Text>
            <Text style={[s.cellNormal, s.colCategory]}>{CATEGORY_LABELS[item.category] || item.category}</Text>
            <Text style={[s.cellBold, s.colGross]}>{item.amount_gross ? fmtEuro(item.amount_gross) : "—"}</Text>
            <Text style={[s.cellNormal, s.colVat]}>{item.amount_vat ? fmtEuro(item.amount_vat) : "—"}</Text>
            <Text style={[s.cellNormal, s.colPayment]}>{PAYMENT_LABELS[item.payment_method] || item.payment_method || "—"}</Text>
          </View>
        ))}

        {/* Summary */}
        <View style={s.summaryBox}>
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Netto</Text>
            <Text style={s.summaryValue}>{fmtEuro(totalNet)}</Text>
          </View>
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>USt gesamt</Text>
            <Text style={s.summaryValue}>{fmtEuro(totalVat)}</Text>
          </View>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Gesamt brutto</Text>
            <Text style={s.totalValue}>{fmtEuro(totalGross)}</Text>
          </View>
        </View>

        {/* Notes */}
        {report.notes ? (
          <View style={s.notesBox}>
            <Text>{report.notes}</Text>
          </View>
        ) : null}

        {/* Footer */}
        <View style={s.footer} fixed>
          <View style={s.footerTop}>
            <View style={s.footerCol}>
              <Text style={s.footerColHeader}>{settings.company_name}</Text>
              <Text>{settings.address}</Text>
              <Text>{settings.zip} {settings.city}</Text>
            </View>
            <View style={s.footerCol}>
              <Text style={s.footerColHeader}>Kontakt</Text>
              <Text>Tel: {settings.phone}</Text>
              <Text>E-Mail: {settings.email}</Text>
            </View>
            <View style={s.footerCol}>
              <Text style={s.footerColHeader}>Bankverbindung</Text>
              <Text>IBAN: {settings.iban}</Text>
              <Text>BIC: {settings.bic}</Text>
            </View>
          </View>
        </View>

        <Text style={s.pageNumber} render={({ pageNumber, totalPages }) => `Seite ${pageNumber} von ${totalPages}`} fixed />
      </Page>

      {/* Receipt appendix pages — one per image receipt */}
      {receiptImages.map((receipt, idx) => (
        <Page key={receipt.itemId} size="A4" style={s.page}>
          <View style={s.goldBar} fixed />
          <Text style={s.receiptPageTitle}>Beleg {idx + 1} von {receiptImages.length}</Text>
          <Text style={s.receiptSubtitle}>{receipt.label}</Text>
          <Image src={receipt.dataUrl} style={s.receiptImage} />
          <Text style={s.receiptMeta}>
            Spesenabrechnung {report.period_month} — {report.user_name}
          </Text>
          <Text style={s.pageNumber} render={({ pageNumber, totalPages }) => `Seite ${pageNumber} von ${totalPages}`} fixed />
        </Page>
      ))}
    </Document>
  );
}
