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
import { Invoice, Customer, CompanySettings, UNIT_OPTIONS, Language } from "@/lib/types";
import { t, getFactOfTheDay } from "@/lib/i18n";
import { resolveTranslation } from "@/lib/i18n-content";

Font.register({
  family: "Inter",
  fonts: [
    { src: "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf", fontWeight: 400 },
    { src: "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf", fontWeight: 400, fontStyle: "italic" },
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
  page: { paddingTop: 45, paddingBottom: 110, paddingLeft: 50, paddingRight: 50, fontFamily: "Inter", fontSize: 9.5, color: c.grayDark },
  goldBar: { position: "absolute", top: 0, left: 0, width: 4, height: "100%", backgroundColor: c.accent },
  header: { flexDirection: "row", justifyContent: "space-between", paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: c.accent },
  logo: { width: 130, height: 55, objectFit: "contain" },
  companyName: { fontWeight: 600, fontSize: 9, color: c.black, marginTop: 8 },
  companyAddr: { fontSize: 8, color: "#888888", lineHeight: 1.5 },
  headerRight: { textAlign: "right" },
  invoiceTitle: { fontSize: 28, fontWeight: 700, color: c.black, textAlign: "right" },
  goldUnderline: { borderBottomWidth: 2, borderBottomColor: c.accent, width: "80%", alignSelf: "flex-end", marginBottom: 10 },
  metaRow: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 3 },
  metaLabel: { fontSize: 8, color: c.grayMid, textTransform: "uppercase", letterSpacing: 0.8, marginRight: 8, width: 100, textAlign: "right" },
  metaValue: { fontSize: 9.5, fontWeight: 600, color: c.black, width: 100, textAlign: "right" },
  recipientBox: { backgroundColor: c.grayLight, borderLeftWidth: 3, borderLeftColor: c.accent, padding: 12, marginTop: 20, marginBottom: 8, width: "50%" },
  recipientLabel: { fontSize: 7.5, color: c.grayMid, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  recipientName: { fontSize: 10, fontWeight: 600, color: c.black },
  recipientAddr: { fontSize: 9, color: c.grayDark, lineHeight: 1.5 },
  projectLine: { flexDirection: "row", gap: 30, marginTop: 12, marginBottom: 20, fontSize: 8.5, color: c.grayDark },
  projectLabel: { textTransform: "uppercase", color: c.grayMid, fontSize: 7.5, letterSpacing: 0.8 },
  projectValue: { fontWeight: 600, color: c.black, fontSize: 8.5 },
  tableHeader: { flexDirection: "row", backgroundColor: c.black, paddingVertical: 7, paddingHorizontal: 10 },
  tableHeaderText: { color: c.white, fontSize: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 },
  tableRow: { flexDirection: "row", paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 0.5, borderBottomColor: c.border },
  tableRowEven: { backgroundColor: c.grayLight },
  discountRow: { backgroundColor: "#FFF8E8", borderLeftWidth: 3, borderLeftColor: c.accent },
  colPos: { width: 30, textAlign: "center" },
  colDesc: { width: 195 },
  colUnit: { width: 55, textAlign: "center" },
  colQty: { width: 50, textAlign: "right" },
  colPrice: { width: 75, textAlign: "right" },
  colTotal: { width: 90, textAlign: "right" },
  cellBold: { fontWeight: 600, color: c.black, fontSize: 9 },
  cellNormal: { color: c.grayDark, fontSize: 9 },
  summaryBox: { alignSelf: "flex-end", width: 230, marginTop: 20 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: c.border },
  summaryLabel: { fontSize: 9, color: c.grayDark },
  summaryValue: { fontSize: 9, color: c.black, fontWeight: 600 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, backgroundColor: c.black, paddingHorizontal: 8 },
  totalLabel: { fontSize: 11, fontWeight: 700, color: c.white },
  totalValue: { fontSize: 11, fontWeight: 700, color: c.white },
  accompanyingBox: { marginTop: 18, borderLeftWidth: 3, borderLeftColor: c.accent, paddingLeft: 10, backgroundColor: "#FEFDF5", padding: 12, fontSize: 9, color: c.grayDark, lineHeight: 1.6, fontStyle: "italic" },
  paymentBox: { marginTop: 12, borderLeftWidth: 3, borderLeftColor: c.accent, paddingLeft: 10, backgroundColor: c.grayLight, padding: 12, fontSize: 8.5, color: c.grayDark, lineHeight: 1.6 },
  footer: { position: "absolute", bottom: 30, left: 50, right: 50, borderTopWidth: 0.5, borderTopColor: c.accent, paddingTop: 10 },
  footerTop: { flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: c.grayMid },
  footerColHeader: { fontWeight: 600, color: c.black, marginBottom: 3, fontSize: 7.5 },
  footerCol: { lineHeight: 1.5 },
  factBox: { marginTop: 8, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: c.border, fontSize: 7, color: c.grayMid, lineHeight: 1.4 },
  factLabel: { fontWeight: 600, color: c.accent, fontSize: 7, marginBottom: 2 },
  pageNumber: { position: "absolute", bottom: 15, right: 50, fontSize: 7.5, color: c.grayMid },
});

function fmtEuro(n: number): string {
  return n.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " \u20AC";
}

function fmtDate(date: string): string {
  const d = new Date(date);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

function unitLabel(unit: string, lang: Language) {
  const opt = UNIT_OPTIONS.find((u) => u.value === unit);
  if (!opt) return unit;
  return lang === "en" ? opt.label_en : opt.label;
}

interface Props {
  invoice: Invoice;
  customer: Customer;
  settings: CompanySettings;
}

export default function InvoicePDF({ invoice, customer, settings }: Props) {
  const lang = invoice.language || "de";
  const isStorniert = invoice.status === "storniert";
  const hasDiscounts = invoice.items.some((i) => i.discount_percent > 0 || i.discount_amount > 0) ||
    invoice.overall_discount_percent > 0 || invoice.overall_discount_amount > 0;

  // SCH-447 — resolve accompanying text via translations JSONB with fallback to legacy de/en columns.
  const accompanyingText = invoice.accompanying_text ??
    resolveTranslation(
      settings.accompanying_text_translations,
      lang,
      lang === "en" ? settings.accompanying_text_en : settings.accompanying_text_de,
    );

  const factOfDay = getFactOfTheDay(lang);

  return (
    <Document>
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
            <Text style={s.invoiceTitle}>{isStorniert ? t("cancellation", lang) : t("invoice", lang)}</Text>
            <View style={s.goldUnderline} />
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>{t("number", lang)}</Text>
              <Text style={s.metaValue}>{invoice.invoice_number}</Text>
            </View>
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>{t("date", lang)}</Text>
              <Text style={s.metaValue}>{fmtDate(invoice.invoice_date)}</Text>
            </View>
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>{t("deliveryDate", lang)}</Text>
              <Text style={s.metaValue}>{fmtDate(invoice.delivery_date)}</Text>
            </View>
          </View>
        </View>

        {/* Recipient */}
        <View style={s.recipientBox}>
          <Text style={s.recipientLabel}>{t("to", lang)}</Text>
          <Text style={s.recipientName}>{customer.company || customer.name}</Text>
          {customer.company && <Text style={s.recipientAddr}>{customer.name}</Text>}
          <Text style={s.recipientAddr}>{customer.address}</Text>
          <Text style={s.recipientAddr}>{customer.zip} {customer.city}</Text>
          {customer.uid_number && <Text style={s.recipientAddr}>UID: {customer.uid_number}</Text>}
        </View>

        {/* Project/Period */}
        {invoice.project_description && (
          <View style={s.projectLine}>
            <View>
              <Text style={s.projectLabel}>{t("project", lang)}</Text>
              <Text style={s.projectValue}>{invoice.project_description}</Text>
            </View>
            <View>
              <Text style={s.projectLabel}>{t("deliveryPeriod", lang)}</Text>
              <Text style={s.projectValue}>{fmtDate(invoice.delivery_date)}</Text>
            </View>
          </View>
        )}

        {/* Table */}
        <View style={s.tableHeader}>
          <Text style={[s.tableHeaderText, s.colPos]}>{t("pos", lang)}</Text>
          <Text style={[s.tableHeaderText, s.colDesc]}>{t("service", lang)}</Text>
          <Text style={[s.tableHeaderText, s.colUnit]}>{t("unit", lang)}</Text>
          <Text style={[s.tableHeaderText, s.colQty]}>{t("quantity", lang)}</Text>
          <Text style={[s.tableHeaderText, s.colPrice]}>{t("price", lang)}</Text>
          <Text style={[s.tableHeaderText, s.colTotal]}>{t("amount", lang)}</Text>
        </View>
        {invoice.items.map((item, idx) => (
          <View key={idx}>
            <View style={[s.tableRow, idx % 2 === 1 ? s.tableRowEven : {}]}>
              <Text style={[s.cellNormal, s.colPos]}>{item.position}</Text>
              <Text style={[s.cellBold, s.colDesc]}>
                {item.description.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
                  part.startsWith("**") && part.endsWith("**")
                    ? <Text key={i} style={{ fontWeight: 700 }}>{part.slice(2, -2)}</Text>
                    : part
                )}
              </Text>
              <Text style={[s.cellNormal, s.colUnit]}>{unitLabel(item.unit, lang)}</Text>
              <Text style={[s.cellNormal, s.colQty]}>{item.quantity}</Text>
              <Text style={[s.cellNormal, s.colPrice]}>{fmtEuro(item.unit_price)}</Text>
              <Text style={[s.cellNormal, s.colTotal]}>{fmtEuro(item.total)}</Text>
            </View>
            {(item.discount_percent > 0 || item.discount_amount > 0) && (
              <View style={[s.tableRow, s.discountRow]}>
                <Text style={[s.cellNormal, s.colPos]}></Text>
                <Text style={[{ color: c.accent, fontSize: 9 }, s.colDesc]}>
                  {item.discount_percent > 0
                    ? `${t("discount", lang)} (${item.discount_percent}%)`
                    : t("discount", lang)}
                </Text>
                <Text style={[s.cellNormal, s.colUnit]}></Text>
                <Text style={[s.cellNormal, s.colQty]}></Text>
                <Text style={[s.cellNormal, s.colPrice]}></Text>
                <Text style={[{ color: c.accent, fontSize: 9 }, s.colTotal]}>
                  {item.discount_percent > 0
                    ? fmtEuro(-(item.quantity * item.unit_price * item.discount_percent / 100))
                    : fmtEuro(-item.discount_amount)}
                </Text>
              </View>
            )}
          </View>
        ))}

        {/* Summary */}
        <View style={s.summaryBox}>
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>{t("net", lang)}</Text>
            <Text style={s.summaryValue}>{fmtEuro(invoice.items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0))}</Text>
          </View>
          {hasDiscounts && (
            <View style={s.summaryRow}>
              <Text style={[s.summaryLabel, { color: c.accent }]}>{t("discount", lang)}</Text>
              <Text style={[s.summaryValue, { color: c.accent }]}>
                {fmtEuro(-(invoice.items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0) - invoice.subtotal))}
              </Text>
            </View>
          )}
          {hasDiscounts && (
            <View style={[s.summaryRow, { borderTopWidth: 1, borderTopColor: c.border }]}>
              <Text style={s.summaryLabel}>{t("netAfterDiscount", lang)}</Text>
              <Text style={s.summaryValue}>{fmtEuro(invoice.subtotal)}</Text>
            </View>
          )}
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>{t("vat", lang)} {invoice.tax_rate}%</Text>
            <Text style={s.summaryValue}>{fmtEuro(invoice.tax_amount)}</Text>
          </View>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>{t("gross", lang)}</Text>
            <Text style={s.totalValue}>{fmtEuro(invoice.total)}</Text>
          </View>
        </View>

        {/* Accompanying Text (Begleittext) */}
        {accompanyingText && (
          <View style={s.accompanyingBox}>
            <Text>{accompanyingText}</Text>
          </View>
        )}

        {/* Payment */}
        <View style={s.paymentBox}>
          <Text>
            {t("paymentText", lang).replace("{number}", invoice.invoice_number)}
          </Text>
        </View>

        {/* Footer with Fact of the Day */}
        <View style={s.footer} fixed>
          <View style={s.footerTop}>
            <View style={s.footerCol}>
              <Text style={s.footerColHeader}>{settings.company_name}</Text>
              <Text>{settings.address}</Text>
              <Text>{settings.zip} {settings.city}</Text>
              <Text>UID: {settings.uid}</Text>
            </View>
            <View style={s.footerCol}>
              <Text style={s.footerColHeader}>{t("contact", lang)}</Text>
              <Text>{t("phone", lang)} {settings.phone}</Text>
              <Text>{t("emailLabel", lang)} {settings.email}</Text>
            </View>
            <View style={s.footerCol}>
              <Text style={s.footerColHeader}>{t("bankDetails", lang)}</Text>
              <Text>IBAN: {settings.iban}</Text>
              <Text>BIC: {settings.bic}</Text>
            </View>
          </View>
          <View style={s.factBox}>
            <Text style={s.factLabel}>Fact of the Day</Text>
            <Text>{factOfDay}</Text>
          </View>
        </View>

        <Text style={s.pageNumber} render={({ pageNumber, totalPages }) => `${t("page", lang)} ${pageNumber} ${t("of", lang)} ${totalPages}`} fixed />
      </Page>
    </Document>
  );
}
