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
import { Invoice, Receipt, Customer, CompanySettings } from "@/lib/types";

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

const s = StyleSheet.create({
  page: { paddingTop: 45, paddingBottom: 80, paddingLeft: 50, paddingRight: 50, fontFamily: "Inter", fontSize: 9.5, color: c.grayDark },
  goldBar: { position: "absolute", top: 0, left: 0, width: 4, height: "100%", backgroundColor: c.accent },

  /* Header */
  header: { flexDirection: "row", justifyContent: "space-between", paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: c.accent },
  logo: { width: 130, height: 55, objectFit: "contain" },
  companyName: { fontWeight: 600, fontSize: 9, color: c.black, marginTop: 8 },
  companyAddr: { fontSize: 8, color: "#888888", lineHeight: 1.5 },
  headerRight: { textAlign: "right" },
  title: { fontSize: 20, fontWeight: 700, color: c.black, textAlign: "right" },
  goldUnderline: { borderBottomWidth: 2, borderBottomColor: c.accent, width: "80%", alignSelf: "flex-end", marginBottom: 10 },

  /* Meta */
  metaRow: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 3 },
  metaLabel: { fontSize: 8, color: c.grayMid, textTransform: "uppercase", letterSpacing: 0.8, marginRight: 8, width: 110, textAlign: "right" },
  metaValue: { fontSize: 9.5, fontWeight: 600, color: c.black, width: 110, textAlign: "right" },

  /* Section heading */
  sectionTitle: { fontSize: 13, fontWeight: 700, color: c.black, marginTop: 22, marginBottom: 8 },

  /* Summary cards row */
  summaryCardsRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  summaryCard: { flex: 1, backgroundColor: c.grayLight, borderLeftWidth: 3, padding: 10 },
  summaryCardLabel: { fontSize: 7.5, color: c.grayMid, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 },
  summaryCardValue: { fontSize: 12, fontWeight: 700, color: c.black },
  summaryCardSub: { fontSize: 7, color: c.grayMid, marginTop: 2 },

  /* Table */
  tableHeader: { flexDirection: "row", backgroundColor: c.black, paddingVertical: 6, paddingHorizontal: 6 },
  tableHeaderText: { color: c.white, fontSize: 7, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 },
  tableRow: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: c.border },
  tableRowEven: { backgroundColor: c.grayLight },
  cellBold: { fontWeight: 600, color: c.black, fontSize: 8 },
  cellNormal: { color: c.grayDark, fontSize: 8 },

  /* Invoice columns */
  invColNr: { width: 55 },
  invColCustomer: { width: 110, flexShrink: 1 },
  invColDate: { width: 55 },
  invColNet: { width: 55, textAlign: "right" },
  invColVat: { width: 50, textAlign: "right" },
  invColGross: { width: 55, textAlign: "right" },
  invColStatus: { width: 50 },

  /* Receipt columns — flexible widths to avoid text clipping */
  recColIssuer: { width: 90, flexShrink: 1 },
  recColPurpose: { width: 80, flexShrink: 1 },
  recColDate: { width: 52 },
  recColNet: { width: 50, textAlign: "right" },
  recColVat: { width: 45, textAlign: "right" },
  recColGross: { width: 50, textAlign: "right" },
  recColBuchung: { width: 58, textAlign: "center" },
  recColScan: { width: 52 },

  /* Totals row */
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, backgroundColor: c.black, paddingHorizontal: 8, marginTop: 2 },
  totalLabel: { fontSize: 10, fontWeight: 700, color: c.white },
  totalValue: { fontSize: 10, fontWeight: 700, color: c.white },

  /* Footer */
  footer: { position: "absolute", bottom: 30, left: 50, right: 50, borderTopWidth: 0.5, borderTopColor: c.accent, paddingTop: 10 },
  footerTop: { flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: c.grayMid },
  footerColHeader: { fontWeight: 600, color: c.black, marginBottom: 3, fontSize: 7.5 },
  footerCol: { lineHeight: 1.5 },
  pageNumber: { position: "absolute", bottom: 15, right: 50, fontSize: 7.5, color: c.grayMid },

  /* Receipt appendix */
  receiptPageTitle: { fontSize: 16, fontWeight: 700, color: c.black, marginBottom: 4 },
  receiptSubtitle: { fontSize: 9, color: c.grayDark, marginBottom: 6 },
  receiptBuchung: { fontSize: 9, color: c.black, fontWeight: 600, marginBottom: 4 },
  receiptScanDate: { fontSize: 8, color: c.grayMid, marginBottom: 14 },
  receiptImage: { maxWidth: "100%", maxHeight: 580, objectFit: "contain" },
  receiptMeta: { fontSize: 8, color: c.grayMid, marginTop: 8 },
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
  receiptId: string;
  dataUrl: string;
  label: string;
}

interface Props {
  invoices: Invoice[];
  receipts: Receipt[];
  customers: Customer[];
  settings: CompanySettings;
  selectedMonth: string;
  receiptImages: ReceiptImageData[];
}

export default function SteuerblattPDF({ invoices, receipts, customers, settings, selectedMonth, receiptImages }: Props) {
  const sortedInvoices = [...invoices].sort((a, b) => a.invoice_date.localeCompare(b.invoice_date));
  const sortedReceipts = [...receipts].sort((a, b) => (a.invoice_date || "").localeCompare(b.invoice_date || ""));

  const totalRevenue = sortedInvoices.filter((i) => i.status !== "storniert").reduce((s, i) => s + i.total, 0);
  const totalVAT = sortedInvoices.filter((i) => i.status !== "storniert").reduce((s, i) => s + i.tax_amount, 0);
  const totalExpenses = sortedReceipts.reduce((s, r) => s + (r.amount_gross || 0), 0);
  const totalExpenseVAT = sortedReceipts.reduce((s, r) => s + (r.amount_vat || 0), 0);

  function getCustomerName(id: string): string {
    const cust = customers.find((c) => c.id === id);
    return cust ? cust.company || cust.name : "Unbekannt";
  }

  const pdfTitle = `${settings.company_name} — ${fmtMonth(selectedMonth)}`;

  return (
    <Document>
      {/* Main report page */}
      <Page size="A4" style={s.page} wrap>
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
            <Text style={s.title}>{pdfTitle}</Text>
            <View style={s.goldUnderline} />
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Zeitraum</Text>
              <Text style={s.metaValue}>{fmtMonth(selectedMonth)}</Text>
            </View>
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Erstellt am</Text>
              <Text style={s.metaValue}>{fmtDate(new Date().toISOString())}</Text>
            </View>
          </View>
        </View>

        {/* Summary cards */}
        <View style={s.summaryCardsRow}>
          <View style={[s.summaryCard, { borderLeftColor: "#10B981" }]}>
            <Text style={s.summaryCardLabel}>Einnahmen brutto</Text>
            <Text style={s.summaryCardValue}>{fmtEuro(totalRevenue)}</Text>
            <Text style={s.summaryCardSub}>{sortedInvoices.length} Rechnungen</Text>
          </View>
          <View style={[s.summaryCard, { borderLeftColor: "#F97316" }]}>
            <Text style={s.summaryCardLabel}>USt Einnahmen</Text>
            <Text style={s.summaryCardValue}>{fmtEuro(totalVAT)}</Text>
          </View>
          <View style={[s.summaryCard, { borderLeftColor: "#F43F5E" }]}>
            <Text style={s.summaryCardLabel}>Ausgaben brutto</Text>
            <Text style={s.summaryCardValue}>{fmtEuro(totalExpenses)}</Text>
            <Text style={s.summaryCardSub}>{sortedReceipts.length} Belege</Text>
          </View>
          <View style={[s.summaryCard, { borderLeftColor: "#06B6D4" }]}>
            <Text style={s.summaryCardLabel}>Vorsteuer</Text>
            <Text style={s.summaryCardValue}>{fmtEuro(totalExpenseVAT)}</Text>
            <Text style={s.summaryCardSub}>USt-Zahllast: {fmtEuro(totalVAT - totalExpenseVAT)}</Text>
          </View>
        </View>

        {/* Invoices table */}
        <Text style={s.sectionTitle}>Ausgangsrechnungen</Text>
        <View style={s.tableHeader}>
          <Text style={[s.tableHeaderText, s.invColNr]}>Nr.</Text>
          <Text style={[s.tableHeaderText, s.invColCustomer]}>Kunde</Text>
          <Text style={[s.tableHeaderText, s.invColDate]}>Datum</Text>
          <Text style={[s.tableHeaderText, s.invColNet]}>Netto</Text>
          <Text style={[s.tableHeaderText, s.invColVat]}>USt</Text>
          <Text style={[s.tableHeaderText, s.invColGross]}>Brutto</Text>
          <Text style={[s.tableHeaderText, s.invColStatus]}>Status</Text>
        </View>
        {sortedInvoices.length === 0 ? (
          <View style={s.tableRow}>
            <Text style={s.cellNormal}>Keine Rechnungen in diesem Monat.</Text>
          </View>
        ) : (
          sortedInvoices.map((inv, idx) => (
            <View key={inv.id} style={[s.tableRow, idx % 2 === 1 ? s.tableRowEven : {}]} wrap={false}>
              <Text style={[s.cellBold, s.invColNr]}>{inv.invoice_number}</Text>
              <Text style={[s.cellNormal, s.invColCustomer]}>{getCustomerName(inv.customer_id)}</Text>
              <Text style={[s.cellNormal, s.invColDate]}>{fmtDate(inv.invoice_date)}</Text>
              <Text style={[s.cellNormal, s.invColNet]}>{fmtEuro(inv.subtotal)}</Text>
              <Text style={[s.cellNormal, s.invColVat]}>{fmtEuro(inv.tax_amount)}</Text>
              <Text style={[s.cellBold, s.invColGross]}>{fmtEuro(inv.total)}</Text>
              <Text style={[s.cellNormal, s.invColStatus]}>{inv.status}</Text>
            </View>
          ))
        )}

        {/* Receipts table */}
        <Text style={s.sectionTitle}>Eingangsbelege</Text>
        <View style={s.tableHeader}>
          <Text style={[s.tableHeaderText, s.recColIssuer]}>Aussteller</Text>
          <Text style={[s.tableHeaderText, s.recColPurpose]}>Zweck</Text>
          <Text style={[s.tableHeaderText, s.recColDate]}>Datum</Text>
          <Text style={[s.tableHeaderText, s.recColNet]}>Netto</Text>
          <Text style={[s.tableHeaderText, s.recColVat]}>USt</Text>
          <Text style={[s.tableHeaderText, s.recColGross]}>Brutto</Text>
          <Text style={[s.tableHeaderText, s.recColBuchung]}>Buchung</Text>
          <Text style={[s.tableHeaderText, s.recColScan]}>Scan</Text>
        </View>
        {sortedReceipts.length === 0 ? (
          <View style={s.tableRow}>
            <Text style={s.cellNormal}>Keine Belege in diesem Monat.</Text>
          </View>
        ) : (
          sortedReceipts.map((r, idx) => (
            <View key={r.id} style={[s.tableRow, idx % 2 === 1 ? s.tableRowEven : {}]} wrap={false}>
              <Text style={[s.cellBold, s.recColIssuer]}>{r.issuer || "—"}</Text>
              <Text style={[s.cellNormal, s.recColPurpose]}>{r.purpose || "—"}</Text>
              <Text style={[s.cellNormal, s.recColDate]}>{r.invoice_date ? fmtDate(r.invoice_date) : "—"}</Text>
              <Text style={[s.cellNormal, s.recColNet]}>{r.amount_net != null ? fmtEuro(r.amount_net) : "—"}</Text>
              <Text style={[s.cellNormal, s.recColVat]}>{r.amount_vat != null ? fmtEuro(r.amount_vat) : "—"}</Text>
              <Text style={[s.cellBold, s.recColGross]}>{r.amount_gross != null ? fmtEuro(r.amount_gross) : "—"}</Text>
              <Text style={[s.cellNormal, s.recColBuchung]}>
                {r.account_debit && r.account_credit ? `${r.account_debit} / ${r.account_credit}` : r.account_debit || "—"}
              </Text>
              <Text style={[s.cellNormal, s.recColScan]}>{fmtDate(r.created_at)}</Text>
            </View>
          ))
        )}

        {/* Totals */}
        <View style={s.totalRow}>
          <Text style={s.totalLabel}>Einnahmen brutto: {fmtEuro(totalRevenue)}</Text>
          <Text style={s.totalValue}>Ausgaben brutto: {fmtEuro(totalExpenses)}</Text>
        </View>

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
      {receiptImages.map((receipt, idx) => {
        const r = sortedReceipts.find((rec) => rec.id === receipt.receiptId);
        return (
          <Page key={receipt.receiptId} size="A4" style={s.page}>
            <View style={s.goldBar} fixed />
            <Text style={s.receiptPageTitle}>Beleg {idx + 1} von {receiptImages.length}</Text>
            <Text style={s.receiptSubtitle}>{receipt.label}</Text>
            {r?.account_debit && (
              <Text style={s.receiptBuchung}>
                Vorgeschlagener Buchungssatz: {r.account_debit} / {r.account_credit || "—"}
                {r.account_label ? ` (${r.account_label})` : ""}
              </Text>
            )}
            <Text style={s.receiptScanDate}>Gescannt am: {r ? fmtDate(r.created_at) : "—"}</Text>
            <Image src={receipt.dataUrl} style={s.receiptImage} />
            <Text style={s.receiptMeta}>
              {pdfTitle}
            </Text>
            <Text style={s.pageNumber} render={({ pageNumber, totalPages }) => `Seite ${pageNumber} von ${totalPages}`} fixed />
          </Page>
        );
      })}
    </Document>
  );
}
