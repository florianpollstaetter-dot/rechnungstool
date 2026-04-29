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
import { Quote, Customer, CompanySettings, Reference, UNIT_OPTIONS, Language } from "@/lib/types";
import { t } from "@/lib/i18n";

Font.register({
  family: "Inter",
  fonts: [
    { src: "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf", fontWeight: 400 },
    { src: "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf", fontWeight: 400, fontStyle: "italic" },
    { src: "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYMZg.ttf", fontWeight: 600 },
    { src: "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf", fontWeight: 700 },
  ],
});

const cl = {
  black: "#0A0A0A",
  accent: "#C9A84C",
  white: "#FFFFFF",
  grayLight: "#F7F7F7",
  grayMid: "#AAAAAA",
  grayDark: "#444444",
  border: "#E0E0E0",
};

const DEFAULT_REFERENCES: Reference[] = [
  { title: "Produktlaunch Event", description: "Immersive Apple Vision Pro Praesentation fuer Markteinfuehrung" },
  { title: "Messe-Experience", description: "Spatial Computing Showcase auf internationaler Messe" },
  { title: "Brand Storytelling", description: "Interaktive Markenwelt fuer Premiumkunden" },
  { title: "Sales Enablement", description: "VR-gestuetztes Verkaufsgespraech-Tool fuer Aussendienst" },
];

const DEFAULT_REFERENCES_EN: Reference[] = [
  { title: "Product Launch Event", description: "Immersive Apple Vision Pro presentation for market launch" },
  { title: "Trade Show Experience", description: "Spatial Computing showcase at international trade show" },
  { title: "Brand Storytelling", description: "Interactive brand world for premium clients" },
  { title: "Sales Enablement", description: "VR-powered sales conversation tool for field teams" },
];

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

const s = StyleSheet.create({
  // Cover
  coverPage: { backgroundColor: cl.black, justifyContent: "center", alignItems: "center", padding: 60 },
  logoWhiteBg: { width: 170, height: 75, borderRadius: 4, backgroundColor: cl.white, justifyContent: "center", alignItems: "center", marginBottom: 40 },
  coverLogo: { width: 150, height: 60, objectFit: "contain" },
  goldLine: { height: 1, backgroundColor: cl.accent, width: 200, marginVertical: 20 },
  coverTitle: { fontSize: 32, fontWeight: 700, color: cl.white, textAlign: "center", letterSpacing: 3, textTransform: "uppercase" },
  coverSubtitle: { fontSize: 18, color: cl.accent, textAlign: "center", marginTop: 10, fontWeight: 600 },
  coverClient: { fontSize: 12, color: cl.white, marginTop: 15, textAlign: "center" },
  coverMeta: { fontSize: 9, color: "#888888", marginTop: 5, textAlign: "center", lineHeight: 1.8 },
  coverCompany: { fontSize: 8, color: "#888888", textAlign: "center", marginTop: 10 },

  // Content pages
  contentPage: { paddingTop: 45, paddingBottom: 60, paddingLeft: 50, paddingRight: 50, fontFamily: "Inter", fontSize: 9.5, color: cl.grayDark },
  goldBar: { position: "absolute", top: 0, left: 0, width: 4, height: "100%", backgroundColor: cl.accent },
  pageHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: cl.accent, marginBottom: 25 },
  pageHeaderLogo: { width: 80, height: 35, objectFit: "contain" },
  pageHeaderTitle: { fontSize: 8, color: cl.grayMid, textTransform: "uppercase", letterSpacing: 1 },
  sectionLabel: { fontSize: 8, color: cl.accent, textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 },
  sectionTitle: { fontSize: 24, fontWeight: 700, color: cl.black, lineHeight: 1.3, marginBottom: 15 },
  bodyText: { fontSize: 9.5, color: cl.grayDark, lineHeight: 1.7 },

  // About page stats
  statsRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 30 },
  statCard: { backgroundColor: cl.grayLight, borderTopWidth: 3, borderTopColor: cl.accent, padding: 15, width: "30%" },
  statNumber: { fontSize: 22, fontWeight: 700, color: cl.black },
  statLabel: { fontSize: 8, color: "#888888", marginTop: 3, textTransform: "uppercase" },

  // References
  refGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  refCard: { width: "47%", marginBottom: 15 },
  refImage: { width: "100%", height: 130, backgroundColor: "#222222", borderLeftWidth: 3, borderLeftColor: cl.accent },
  refTitle: { fontSize: 10, fontWeight: 600, marginTop: 8, color: cl.black },
  refDesc: { fontSize: 8.5, color: "#888888", marginTop: 3, lineHeight: 1.5 },

  // Services
  serviceItem: { borderLeftWidth: 2, borderLeftColor: cl.accent, paddingLeft: 10, marginBottom: 12 },
  serviceName: { fontSize: 10, fontWeight: 600, color: cl.black },
  serviceDetail: { fontSize: 8.5, color: "#666666", marginTop: 2 },

  // Pricing table
  tableHeader: { flexDirection: "row", backgroundColor: cl.black, paddingVertical: 7, paddingHorizontal: 10 },
  tableHeaderText: { color: cl.white, fontSize: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 },
  tableRow: { flexDirection: "row", paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 0.5, borderBottomColor: cl.border },
  tableRowEven: { backgroundColor: cl.grayLight },
  discountRow: { backgroundColor: "#FFF8E8", borderLeftWidth: 3, borderLeftColor: cl.accent },
  colPos: { width: 30, textAlign: "center" },
  colDesc: { width: 195 },
  colUnit: { width: 55, textAlign: "center" },
  colQty: { width: 50, textAlign: "right" },
  colPrice: { width: 75, textAlign: "right" },
  colTotal: { width: 90, textAlign: "right" },
  cellBold: { fontWeight: 600, color: cl.black, fontSize: 9 },
  cellNormal: { color: cl.grayDark, fontSize: 9 },

  // Summary
  summaryBox: { alignSelf: "flex-end", width: 260, marginTop: 20 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: cl.border },
  summaryLabel: { fontSize: 9, color: cl.grayDark },
  summaryValue: { fontSize: 9, color: cl.black, fontWeight: 600 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, backgroundColor: cl.black, paddingHorizontal: 8 },
  totalLabel: { fontSize: 11, fontWeight: 700, color: cl.white },
  totalValue: { fontSize: 11, fontWeight: 700, color: cl.white },
  validityBox: { marginTop: 20, borderLeftWidth: 3, borderLeftColor: cl.accent, backgroundColor: cl.grayLight, padding: 12, fontSize: 8.5, color: cl.grayDark },
  // SCH-924 K2-θ
  sectionRow: { backgroundColor: cl.grayLight, borderLeftWidth: 3, borderLeftColor: cl.accent, paddingVertical: 8, paddingHorizontal: 10, marginTop: 4 },
  sectionRowText: { fontSize: 10, fontWeight: 700, color: cl.black, textTransform: "uppercase", letterSpacing: 0.5 },
  travelDayBreakdown: { backgroundColor: "#FFF8E8", borderLeftWidth: 3, borderLeftColor: cl.accent, paddingVertical: 4, paddingHorizontal: 10, fontSize: 8, color: cl.grayDark, fontStyle: "italic" },
  clauseBlock: { marginTop: 14, borderLeftWidth: 3, borderLeftColor: cl.accent, backgroundColor: cl.grayLight, padding: 12 },
  clauseLabel: { fontSize: 8, color: cl.accent, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4, fontWeight: 600 },
  clauseBody: { fontSize: 9, color: cl.grayDark, lineHeight: 1.6 },

  // Closing
  closingPage: { backgroundColor: cl.black, justifyContent: "center", alignItems: "center", padding: 60 },
  closingText: { fontSize: 24, fontWeight: 700, color: cl.white, textAlign: "center", lineHeight: 1.4 },
  closingContact: { fontSize: 12, color: cl.accent, marginTop: 10, textAlign: "center" },
  closingDetails: { fontSize: 10, color: cl.white, lineHeight: 1.8, textAlign: "center", marginTop: 10 },
  closingFooter: { fontSize: 8, color: "#888888", textAlign: "center", marginTop: 10 },
});

interface Props {
  quote: Quote;
  customer: Customer;
  settings: CompanySettings;
  references?: Reference[];
}

export default function QuotePDF({ quote, customer, settings, references }: Props) {
  const lang = quote.language || "de";
  const isSimple = quote.display_mode === "simple";
  const hasDiscounts = quote.items.some((i) => i.discount_percent > 0 || i.discount_amount > 0) ||
    quote.overall_discount_percent > 0 || quote.overall_discount_amount > 0;

  const refs = references || (lang === "en" ? DEFAULT_REFERENCES_EN : DEFAULT_REFERENCES);

  return (
    <Document>
      {/* Page 1: Cover */}
      <Page size="A4" style={[s.coverPage, { fontFamily: "Inter" }]}>
        <View style={s.logoWhiteBg}>
          {settings.logo_url ? <Image src={settings.logo_url} style={s.coverLogo} /> : null}
        </View>
        <View style={s.goldLine} />
        <Text style={s.coverTitle}>{t("quote", lang)}</Text>
        <Text style={s.coverSubtitle}>{quote.project_description || (lang === "de" ? "Projektangebot" : "Project Quote")}</Text>
        <Text style={s.coverClient}>{t("forClient", lang)}: {customer.company || customer.name}</Text>
        <View style={{ marginTop: 15 }}>
          <Text style={s.coverMeta}>{t("quoteNumber", lang)}: {quote.quote_number}</Text>
          <Text style={s.coverMeta}>{t("date", lang)}: {fmtDate(quote.quote_date)}</Text>
          <Text style={s.coverMeta}>{t("validUntil", lang)}: {fmtDate(quote.valid_until)}</Text>
        </View>
        <View style={s.goldLine} />
        <Text style={s.coverCompany}>{settings.company_name}</Text>
        <Text style={s.coverCompany}>{settings.address}, {settings.zip} {settings.city}</Text>
      </Page>

      {/* Page 2: About Us (detailed only) */}
      {!isSimple && (
        <Page size="A4" style={[s.contentPage, { fontFamily: "Inter" }]}>
          <View style={s.goldBar} />
          <View style={s.pageHeader}>
            {settings.logo_url ? <Image src={settings.logo_url} style={s.pageHeaderLogo} /> : null}
            <Text style={s.pageHeaderTitle}>{t("aboutUs", lang)}</Text>
          </View>
          <Text style={s.sectionLabel}>{t("aboutUs", lang)}</Text>
          <Text style={s.sectionTitle}>VR the Fans {"\u2014"}{"\n"}{t("aboutUsTitle", lang)}</Text>
          <Text style={s.bodyText}>{t("aboutUsBody", lang)}</Text>
          <View style={s.statsRow}>
            <View style={s.statCard}>
              <Text style={s.statNumber}>50+</Text>
              <Text style={s.statLabel}>{t("projects", lang)}</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statNumber}>Apple</Text>
              <Text style={s.statLabel}>VISION PRO</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statNumber}>Wien</Text>
              <Text style={s.statLabel}>{t("base", lang)}</Text>
            </View>
          </View>
        </Page>
      )}

      {/* Page 3: References (detailed only) */}
      {!isSimple && (
        <Page size="A4" style={[s.contentPage, { fontFamily: "Inter" }]}>
          <View style={s.goldBar} />
          <View style={s.pageHeader}>
            {settings.logo_url ? <Image src={settings.logo_url} style={s.pageHeaderLogo} /> : null}
            <Text style={s.pageHeaderTitle}>{t("references", lang)}</Text>
          </View>
          <Text style={s.sectionLabel}>{t("references", lang)}</Text>
          <Text style={[s.sectionTitle, { fontSize: 20 }]}>{t("selectedProjects", lang)}</Text>
          <View style={s.refGrid}>
            {refs.map((ref, idx) => (
              <View key={idx} style={s.refCard}>
                {ref.imageUrl ? (
                  <Image src={ref.imageUrl} style={s.refImage} />
                ) : (
                  <View style={s.refImage} />
                )}
                <Text style={s.refTitle}>{ref.title}</Text>
                <Text style={s.refDesc}>{ref.description}</Text>
              </View>
            ))}
          </View>
        </Page>
      )}

      {/* Page 4: Service Description (detailed only) */}
      {!isSimple && (
        <Page size="A4" style={[s.contentPage, { fontFamily: "Inter" }]}>
          <View style={s.goldBar} />
          <View style={s.pageHeader}>
            {settings.logo_url ? <Image src={settings.logo_url} style={s.pageHeaderLogo} /> : null}
            <Text style={s.pageHeaderTitle}>{t("serviceScope", lang)}</Text>
          </View>
          <Text style={s.sectionLabel}>{t("serviceScope", lang)}</Text>
          <Text style={[s.sectionTitle, { fontSize: 22 }]}>{quote.project_description || t("projectServices", lang)}</Text>
          {quote.notes && <Text style={[s.bodyText, { marginBottom: 20 }]}>{quote.notes}</Text>}
          {quote.items.map((item, idx) => {
            if (item.item_type === "section") {
              return (
                <View key={idx} style={[s.sectionRow, { marginTop: 10, marginBottom: 6 }]}>
                  <Text style={s.sectionRowText}>{item.description}</Text>
                </View>
              );
            }
            return (
              <View key={idx} style={s.serviceItem}>
                <Text style={s.serviceName}>{item.description}</Text>
                <Text style={s.serviceDetail}>
                  {item.quantity} {unitLabel(item.unit, lang)} x {fmtEuro(item.unit_price)}
                </Text>
              </View>
            );
          })}
        </Page>
      )}

      {/* Pricing Table Page */}
      <Page size="A4" style={[s.contentPage, { fontFamily: "Inter" }]}>
        <View style={s.goldBar} />
        <View style={s.pageHeader}>
          {settings.logo_url ? <Image src={settings.logo_url} style={s.pageHeaderLogo} /> : null}
          <Text style={s.pageHeaderTitle}>{t("pricingOverview", lang)}</Text>
        </View>
        <Text style={s.sectionLabel}>{t("pricingOverview", lang)}</Text>
        <Text style={[s.sectionTitle, { fontSize: 20 }]}>{t("investmentOverview", lang)}</Text>

        <View style={s.tableHeader}>
          <Text style={[s.tableHeaderText, s.colPos]}>{t("pos", lang)}</Text>
          <Text style={[s.tableHeaderText, s.colDesc]}>{t("service", lang)}</Text>
          <Text style={[s.tableHeaderText, s.colUnit]}>{t("unit", lang)}</Text>
          <Text style={[s.tableHeaderText, s.colQty]}>{t("quantity", lang)}</Text>
          <Text style={[s.tableHeaderText, s.colPrice]}>{t("price", lang)}</Text>
          <Text style={[s.tableHeaderText, s.colTotal]}>{t("amount", lang)}</Text>
        </View>
        {quote.items.map((item, idx) => {
          if (item.item_type === "section") {
            return (
              <View key={idx} style={s.sectionRow}>
                <Text style={s.sectionRowText}>{item.description}</Text>
              </View>
            );
          }
          const isTravelDay = item.item_type === "travel_day";
          const travelRefs = isTravelDay && item.travel_day_config
            ? quote.items.filter((other) =>
                item.travel_day_config?.referenced_item_ids.includes(other.id),
              )
            : [];
          return (
            <View key={idx}>
              <View style={[s.tableRow, idx % 2 === 1 ? s.tableRowEven : {}]}>
                <Text style={[s.cellNormal, s.colPos]}>{item.position}</Text>
                <Text style={[s.cellBold, s.colDesc]}>{item.description}</Text>
                <Text style={[s.cellNormal, s.colUnit]}>{unitLabel(item.unit, lang)}</Text>
                <Text style={[s.cellNormal, s.colQty]}>{item.quantity}</Text>
                <Text style={[s.cellNormal, s.colPrice]}>{fmtEuro(item.unit_price)}</Text>
                <Text style={[s.cellNormal, s.colTotal]}>{fmtEuro(item.total)}</Text>
              </View>
              {isTravelDay && travelRefs.length > 0 && (
                <View style={s.travelDayBreakdown}>
                  <Text>
                    {item.travel_day_config?.percent ?? 50}% {"\u00d7 "}
                    {travelRefs.map((r) => `${r.description} (${fmtEuro(r.unit_price)})`).join(" + ")}
                  </Text>
                </View>
              )}
              {(item.discount_percent > 0 || item.discount_amount > 0) && (
                <View style={[s.tableRow, s.discountRow]}>
                  <Text style={[s.cellNormal, s.colPos]}></Text>
                  <Text style={[{ color: cl.accent, fontSize: 9 }, s.colDesc]}>
                    {item.discount_percent > 0 ? `${t("discount", lang)} (${item.discount_percent}%)` : t("discount", lang)}
                  </Text>
                  <Text style={[s.cellNormal, s.colUnit]}></Text>
                  <Text style={[s.cellNormal, s.colQty]}></Text>
                  <Text style={[s.cellNormal, s.colPrice]}></Text>
                  <Text style={[{ color: cl.accent, fontSize: 9 }, s.colTotal]}>
                    {item.discount_percent > 0
                      ? fmtEuro(-(item.quantity * item.unit_price * item.discount_percent / 100))
                      : fmtEuro(-item.discount_amount)}
                  </Text>
                </View>
              )}
            </View>
          );
        })}

        <View style={s.summaryBox}>
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>{t("net", lang)}</Text>
            <Text style={s.summaryValue}>{fmtEuro(quote.items.filter((i) => i.item_type !== "section").reduce((sum, i) => sum + i.quantity * i.unit_price, 0))}</Text>
          </View>
          {hasDiscounts && (
            <View style={s.summaryRow}>
              <Text style={[s.summaryLabel, { color: cl.accent }]}>{t("discount", lang)}</Text>
              <Text style={[s.summaryValue, { color: cl.accent }]}>
                {fmtEuro(-(quote.items.filter((i) => i.item_type !== "section").reduce((sum, i) => sum + i.quantity * i.unit_price, 0) - quote.subtotal))}
              </Text>
            </View>
          )}
          {hasDiscounts && (
            <View style={[s.summaryRow, { borderTopWidth: 1, borderTopColor: cl.border }]}>
              <Text style={s.summaryLabel}>{t("netAfterDiscount", lang)}</Text>
              <Text style={s.summaryValue}>{fmtEuro(quote.subtotal)}</Text>
            </View>
          )}
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>{t("vat", lang)} {quote.tax_rate}%</Text>
            <Text style={s.summaryValue}>{fmtEuro(quote.tax_amount)}</Text>
          </View>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>{t("totalGross", lang)}</Text>
            <Text style={s.totalValue}>{fmtEuro(quote.total)}</Text>
          </View>
        </View>

        <View style={s.validityBox}>
          <Text>
            {t("validityNote", lang).replace("{date}", fmtDate(quote.valid_until))}
          </Text>
        </View>

        {quote.buyouts && (
          <View style={s.clauseBlock}>
            <Text style={s.clauseLabel}>{t("buyouts", lang)}</Text>
            <Text style={s.clauseBody}>{quote.buyouts}</Text>
          </View>
        )}
        {quote.exports_and_delivery && (
          <View style={s.clauseBlock}>
            <Text style={s.clauseLabel}>{t("exportsAndDelivery", lang)}</Text>
            <Text style={s.clauseBody}>{quote.exports_and_delivery}</Text>
          </View>
        )}
        {quote.assumptions && (
          <View style={s.clauseBlock}>
            <Text style={s.clauseLabel}>{t("assumptions", lang)}</Text>
            <Text style={s.clauseBody}>{quote.assumptions}</Text>
          </View>
        )}
      </Page>

      {/* Closing / CTA (detailed only) */}
      {!isSimple && (
        <Page size="A4" style={[s.closingPage, { fontFamily: "Inter" }]}>
          <View style={s.logoWhiteBg}>
            {settings.logo_url ? <Image src={settings.logo_url} style={s.coverLogo} /> : null}
          </View>
          <View style={s.goldLine} />
          <Text style={s.closingText}>{t("closingText", lang)}</Text>
          <Text style={s.closingContact}>{settings.company_name}</Text>
          <View style={{ marginTop: 10 }}>
            <Text style={s.closingDetails}>{lang === "de" ? "Tel." : "Phone"}: {settings.phone}</Text>
            <Text style={s.closingDetails}>{t("emailLabel", lang)} {settings.email}</Text>
          </View>
          <View style={s.goldLine} />
          <Text style={s.closingFooter}>{settings.address}, {settings.zip} {settings.city}</Text>
          <Text style={s.closingFooter}>UID: {settings.uid}</Text>
        </Page>
      )}
    </Document>
  );
}
