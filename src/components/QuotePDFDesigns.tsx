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
import { Quote, Customer, CompanySettings, Reference, UNIT_OPTIONS, Language, QuoteDesignKey, QuoteDesignAIPayload } from "@/lib/types";
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

interface DesignProps {
  quote: Quote;
  customer: Customer;
  settings: CompanySettings;
  references?: Reference[];
  photoUrls?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED: Pricing table used by all designs
// ═══════════════════════════════════════════════════════════════════════════════

function PricingTable({ quote, settings, lang, colors }: { quote: Quote; settings: CompanySettings; lang: Language; colors: { accent: string; black: string; white: string; gray: string; border: string; bg: string } }) {
  const hasDiscounts = quote.items.some((i) => i.discount_percent > 0 || i.discount_amount > 0) ||
    quote.overall_discount_percent > 0 || quote.overall_discount_amount > 0;
  const isKleinunternehmer = settings.is_kleinunternehmer === true;

  return (
    <View>
      <View style={{ flexDirection: "row", backgroundColor: colors.black, paddingVertical: 7, paddingHorizontal: 10 }}>
        <Text style={{ color: colors.white, fontSize: 8, fontWeight: 600, width: 30, textAlign: "center" }}>{t("pos", lang)}</Text>
        <Text style={{ color: colors.white, fontSize: 8, fontWeight: 600, width: 195 }}>{t("service", lang)}</Text>
        <Text style={{ color: colors.white, fontSize: 8, fontWeight: 600, width: 55, textAlign: "center" }}>{t("unit", lang)}</Text>
        <Text style={{ color: colors.white, fontSize: 8, fontWeight: 600, width: 50, textAlign: "right" }}>{t("quantity", lang)}</Text>
        <Text style={{ color: colors.white, fontSize: 8, fontWeight: 600, width: 75, textAlign: "right" }}>{t("price", lang)}</Text>
        <Text style={{ color: colors.white, fontSize: 8, fontWeight: 600, width: 90, textAlign: "right" }}>{t("amount", lang)}</Text>
      </View>
      {quote.items.map((item, idx) => (
        <View key={idx}>
          <View style={{ flexDirection: "row", paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 0.5, borderBottomColor: colors.border, backgroundColor: idx % 2 === 1 ? colors.bg : "transparent" }}>
            <Text style={{ fontSize: 9, color: colors.gray, width: 30, textAlign: "center" }}>{item.position}</Text>
            <Text style={{ fontSize: 9, fontWeight: 600, color: colors.black, width: 195 }}>{item.description}</Text>
            <Text style={{ fontSize: 9, color: colors.gray, width: 55, textAlign: "center" }}>{unitLabel(item.unit, lang)}</Text>
            <Text style={{ fontSize: 9, color: colors.gray, width: 50, textAlign: "right" }}>{item.quantity}</Text>
            <Text style={{ fontSize: 9, color: colors.gray, width: 75, textAlign: "right" }}>{fmtEuro(item.unit_price)}</Text>
            <Text style={{ fontSize: 9, color: colors.gray, width: 90, textAlign: "right" }}>{fmtEuro(item.total)}</Text>
          </View>
          {(item.discount_percent > 0 || item.discount_amount > 0) && (
            <View style={{ flexDirection: "row", paddingVertical: 8, paddingHorizontal: 10, backgroundColor: "#FFF8E8", borderLeftWidth: 3, borderLeftColor: colors.accent, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
              <Text style={{ fontSize: 9, width: 30 }}></Text>
              <Text style={{ fontSize: 9, color: colors.accent, width: 195 }}>
                {item.discount_percent > 0 ? `${t("discount", lang)} (${item.discount_percent}%)` : t("discount", lang)}
              </Text>
              <Text style={{ fontSize: 9, width: 55 }}></Text>
              <Text style={{ fontSize: 9, width: 50 }}></Text>
              <Text style={{ fontSize: 9, width: 75 }}></Text>
              <Text style={{ fontSize: 9, color: colors.accent, width: 90, textAlign: "right" }}>
                {item.discount_percent > 0
                  ? fmtEuro(-(item.quantity * item.unit_price * item.discount_percent / 100))
                  : fmtEuro(-item.discount_amount)}
              </Text>
            </View>
          )}
        </View>
      ))}

      <View style={{ alignSelf: "flex-end", width: 260, marginTop: 20 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
          <Text style={{ fontSize: 9, color: colors.gray }}>{t("net", lang)}</Text>
          <Text style={{ fontSize: 9, color: colors.black, fontWeight: 600 }}>{fmtEuro(quote.items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0))}</Text>
        </View>
        {hasDiscounts && (
          <>
            <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
              <Text style={{ fontSize: 9, color: colors.accent }}>{t("discount", lang)}</Text>
              <Text style={{ fontSize: 9, color: colors.accent, fontWeight: 600 }}>
                {fmtEuro(-(quote.items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0) - quote.subtotal))}
              </Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: colors.border, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Text style={{ fontSize: 9, color: colors.gray }}>{t("netAfterDiscount", lang)}</Text>
              <Text style={{ fontSize: 9, color: colors.black, fontWeight: 600 }}>{fmtEuro(quote.subtotal)}</Text>
            </View>
          </>
        )}
        {!isKleinunternehmer && (
          <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
            <Text style={{ fontSize: 9, color: colors.gray }}>{t("vat", lang)} {quote.tax_rate}%</Text>
            <Text style={{ fontSize: 9, color: colors.black, fontWeight: 600 }}>{fmtEuro(quote.tax_amount)}</Text>
          </View>
        )}
        <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, backgroundColor: colors.black, paddingHorizontal: 8 }}>
          <Text style={{ fontSize: 11, fontWeight: 700, color: colors.white }}>{t("totalGross", lang)}</Text>
          <Text style={{ fontSize: 11, fontWeight: 700, color: colors.white }}>{fmtEuro(isKleinunternehmer ? quote.subtotal : quote.total)}</Text>
        </View>
      </View>

      {isKleinunternehmer && (
        <View style={{ marginTop: 12, padding: 10, backgroundColor: colors.bg, borderLeftWidth: 3, borderLeftColor: colors.accent }}>
          <Text style={{ fontSize: 8.5, color: colors.black }}>{t("kleinunternehmerExemptionNote", lang)}</Text>
        </View>
      )}

      <View style={{ marginTop: 20, borderLeftWidth: 3, borderLeftColor: colors.accent, backgroundColor: colors.bg, padding: 12, fontSize: 8.5, color: colors.gray }}>
        <Text>{t("validityNote", lang).replace("{date}", fmtDate(quote.valid_until))}</Text>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DESIGN 1: MODERN — Clean blue gradients, card-based layout
// ═══════════════════════════════════════════════════════════════════════════════

const modernColors = {
  primary: "#1A56DB",
  primaryLight: "#E8EEFB",
  dark: "#111827",
  white: "#FFFFFF",
  gray: "#6B7280",
  grayLight: "#F3F4F6",
  border: "#E5E7EB",
};

const modernStyles = StyleSheet.create({
  coverPage: { backgroundColor: modernColors.white, padding: 60, fontFamily: "Inter", justifyContent: "center" },
  topBar: { position: "absolute", top: 0, left: 0, right: 0, height: 8, backgroundColor: modernColors.primary },
  contentPage: { paddingTop: 50, paddingBottom: 60, paddingHorizontal: 50, fontFamily: "Inter", fontSize: 9.5, color: modernColors.dark },
  pageHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 15, borderBottomWidth: 2, borderBottomColor: modernColors.primary, marginBottom: 25 },
});

function ModernDesign({ quote, customer, settings, references, photoUrls }: DesignProps) {
  const lang = quote.language || "de";
  const isSimple = quote.display_mode === "simple";
  const refs = references || [];
  const photos = photoUrls || [];

  return (
    <Document>
      {/* Cover */}
      <Page size="A4" style={modernStyles.coverPage}>
        <View style={modernStyles.topBar} />
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 60 }}>
          {settings.logo_url ? <Image src={settings.logo_url} style={{ width: 120, height: 50, objectFit: "contain" }} /> : <View />}
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 8, color: modernColors.gray }}>{settings.company_name}</Text>
            <Text style={{ fontSize: 8, color: modernColors.gray }}>{settings.address}, {settings.zip} {settings.city}</Text>
          </View>
        </View>
        <View style={{ backgroundColor: modernColors.primaryLight, borderRadius: 8, padding: 40, marginBottom: 40 }}>
          <Text style={{ fontSize: 10, color: modernColors.primary, textTransform: "uppercase", letterSpacing: 3, marginBottom: 10 }}>{t("quote", lang)}</Text>
          <Text style={{ fontSize: 28, fontWeight: 700, color: modernColors.dark, lineHeight: 1.2, marginBottom: 15 }}>{quote.project_description || (lang === "de" ? "Projektangebot" : "Project Quote")}</Text>
          <View style={{ height: 3, width: 60, backgroundColor: modernColors.primary, marginBottom: 15 }} />
          <Text style={{ fontSize: 12, color: modernColors.gray }}>{t("forClient", lang)}: {customer.company || customer.name}</Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <View style={{ backgroundColor: modernColors.grayLight, borderRadius: 6, padding: 15, width: "30%" }}>
            <Text style={{ fontSize: 8, color: modernColors.gray, textTransform: "uppercase", marginBottom: 4 }}>{t("quoteNumber", lang)}</Text>
            <Text style={{ fontSize: 11, fontWeight: 600, color: modernColors.dark }}>{quote.quote_number}</Text>
          </View>
          <View style={{ backgroundColor: modernColors.grayLight, borderRadius: 6, padding: 15, width: "30%" }}>
            <Text style={{ fontSize: 8, color: modernColors.gray, textTransform: "uppercase", marginBottom: 4 }}>{t("date", lang)}</Text>
            <Text style={{ fontSize: 11, fontWeight: 600, color: modernColors.dark }}>{fmtDate(quote.quote_date)}</Text>
          </View>
          <View style={{ backgroundColor: modernColors.grayLight, borderRadius: 6, padding: 15, width: "30%" }}>
            <Text style={{ fontSize: 8, color: modernColors.gray, textTransform: "uppercase", marginBottom: 4 }}>{t("validUntil", lang)}</Text>
            <Text style={{ fontSize: 11, fontWeight: 600, color: modernColors.dark }}>{fmtDate(quote.valid_until)}</Text>
          </View>
        </View>
      </Page>

      {/* About / References (detailed only) */}
      {!isSimple && (
        <Page size="A4" style={modernStyles.contentPage}>
          <View style={modernStyles.topBar} />
          <View style={modernStyles.pageHeader}>
            {settings.logo_url ? <Image src={settings.logo_url} style={{ width: 80, height: 35, objectFit: "contain" }} /> : <View />}
            <Text style={{ fontSize: 8, color: modernColors.gray, textTransform: "uppercase", letterSpacing: 1 }}>{t("aboutUs", lang)}</Text>
          </View>
          <Text style={{ fontSize: 10, color: modernColors.primary, textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>{t("aboutUs", lang)}</Text>
          <Text style={{ fontSize: 20, fontWeight: 700, color: modernColors.dark, marginBottom: 15 }}>{t("aboutUsTitle", lang)}</Text>
          <Text style={{ fontSize: 9.5, color: modernColors.gray, lineHeight: 1.7, marginBottom: 30 }}>{t("aboutUsBody", lang)}</Text>

          {(photos.length > 0 || refs.length > 0) && (
            <>
              <Text style={{ fontSize: 10, color: modernColors.primary, textTransform: "uppercase", letterSpacing: 2, marginBottom: 12 }}>{t("references", lang)}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
                {(photos.length > 0 ? photos.slice(0, 4) : [null, null, null, null]).map((photo, idx) => {
                  const ref = refs[idx];
                  return (
                    <View key={idx} style={{ width: "47%", marginBottom: 15 }}>
                      {photo ? (
                        <Image src={photo} style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 4 }} />
                      ) : (
                        <View style={{ width: "100%", height: 120, backgroundColor: modernColors.primaryLight, borderRadius: 4 }} />
                      )}
                      {ref && <Text style={{ fontSize: 10, fontWeight: 600, marginTop: 6, color: modernColors.dark }}>{ref.title}</Text>}
                      {ref && <Text style={{ fontSize: 8.5, color: modernColors.gray, marginTop: 2 }}>{ref.description}</Text>}
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </Page>
      )}

      {/* Services (detailed only) */}
      {!isSimple && (
        <Page size="A4" style={modernStyles.contentPage}>
          <View style={modernStyles.topBar} />
          <View style={modernStyles.pageHeader}>
            {settings.logo_url ? <Image src={settings.logo_url} style={{ width: 80, height: 35, objectFit: "contain" }} /> : <View />}
            <Text style={{ fontSize: 8, color: modernColors.gray, textTransform: "uppercase", letterSpacing: 1 }}>{t("serviceScope", lang)}</Text>
          </View>
          <Text style={{ fontSize: 10, color: modernColors.primary, textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>{t("serviceScope", lang)}</Text>
          <Text style={{ fontSize: 18, fontWeight: 700, color: modernColors.dark, marginBottom: 15 }}>{quote.project_description || t("projectServices", lang)}</Text>
          {quote.notes && <Text style={{ fontSize: 9.5, color: modernColors.gray, lineHeight: 1.7, marginBottom: 20 }}>{quote.notes}</Text>}
          {quote.items.map((item, idx) => (
            <View key={idx} style={{ borderLeftWidth: 3, borderLeftColor: modernColors.primary, paddingLeft: 12, marginBottom: 12, backgroundColor: modernColors.grayLight, paddingVertical: 8, paddingRight: 12, borderRadius: 4 }}>
              <Text style={{ fontSize: 10, fontWeight: 600, color: modernColors.dark }}>{item.description}</Text>
              <Text style={{ fontSize: 8.5, color: modernColors.gray, marginTop: 2 }}>{item.quantity} {unitLabel(item.unit, lang)} x {fmtEuro(item.unit_price)}</Text>
            </View>
          ))}
        </Page>
      )}

      {/* Pricing */}
      <Page size="A4" style={modernStyles.contentPage}>
        <View style={modernStyles.topBar} />
        <View style={modernStyles.pageHeader}>
          {settings.logo_url ? <Image src={settings.logo_url} style={{ width: 80, height: 35, objectFit: "contain" }} /> : <View />}
          <Text style={{ fontSize: 8, color: modernColors.gray, textTransform: "uppercase", letterSpacing: 1 }}>{t("pricingOverview", lang)}</Text>
        </View>
        <Text style={{ fontSize: 10, color: modernColors.primary, textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>{t("pricingOverview", lang)}</Text>
        <Text style={{ fontSize: 18, fontWeight: 700, color: modernColors.dark, marginBottom: 15 }}>{t("investmentOverview", lang)}</Text>
        <PricingTable quote={quote} settings={settings} lang={lang} colors={{ accent: modernColors.primary, black: modernColors.dark, white: modernColors.white, gray: modernColors.gray, border: modernColors.border, bg: modernColors.grayLight }} />
      </Page>

      {/* Closing (detailed only) */}
      {!isSimple && (
        <Page size="A4" style={{ backgroundColor: modernColors.dark, justifyContent: "center", alignItems: "center", padding: 60, fontFamily: "Inter" }}>
          <View style={{ backgroundColor: modernColors.white, width: 170, height: 75, borderRadius: 4, justifyContent: "center", alignItems: "center", marginBottom: 40 }}>
            {settings.logo_url ? <Image src={settings.logo_url} style={{ width: 150, height: 60, objectFit: "contain" }} /> : null}
          </View>
          <View style={{ height: 3, backgroundColor: modernColors.primary, width: 200, marginVertical: 20 }} />
          <Text style={{ fontSize: 24, fontWeight: 700, color: modernColors.white, textAlign: "center", lineHeight: 1.4 }}>{t("closingText", lang)}</Text>
          <Text style={{ fontSize: 12, color: modernColors.primary, marginTop: 10, textAlign: "center" }}>{settings.company_name}</Text>
          <Text style={{ fontSize: 10, color: modernColors.white, lineHeight: 1.8, textAlign: "center", marginTop: 10 }}>{lang === "de" ? "Tel." : "Phone"}: {settings.phone}</Text>
          <Text style={{ fontSize: 10, color: modernColors.white, textAlign: "center" }}>{t("emailLabel", lang)} {settings.email}</Text>
        </Page>
      )}
    </Document>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DESIGN 2: MINIMAL — Ultra-clean, lots of whitespace, thin lines
// ═══════════════════════════════════════════════════════════════════════════════

const minimalColors = {
  black: "#1a1a1a",
  gray: "#999999",
  grayLight: "#f5f5f5",
  border: "#e0e0e0",
  accent: "#1a1a1a",
  white: "#ffffff",
};

function MinimalDesign({ quote, customer, settings, references, photoUrls }: DesignProps) {
  const lang = quote.language || "de";
  const isSimple = quote.display_mode === "simple";
  const refs = references || [];
  const photos = photoUrls || [];

  return (
    <Document>
      {/* Cover */}
      <Page size="A4" style={{ padding: 70, fontFamily: "Inter", justifyContent: "space-between", minHeight: "100%" }}>
        <View>
          {settings.logo_url ? <Image src={settings.logo_url} style={{ width: 100, height: 40, objectFit: "contain", marginBottom: 60 }} /> : <View style={{ marginBottom: 60 }} />}
          <Text style={{ fontSize: 42, fontWeight: 700, color: minimalColors.black, lineHeight: 1.1, letterSpacing: -1 }}>{t("quote", lang)}</Text>
          <View style={{ height: 1, backgroundColor: minimalColors.black, width: 40, marginVertical: 25 }} />
          <Text style={{ fontSize: 14, color: minimalColors.gray, lineHeight: 1.6 }}>{quote.project_description || (lang === "de" ? "Projektangebot" : "Project Quote")}</Text>
          <Text style={{ fontSize: 11, color: minimalColors.black, marginTop: 20, fontWeight: 600 }}>{customer.company || customer.name}</Text>
        </View>
        <View>
          <View style={{ height: 0.5, backgroundColor: minimalColors.border, marginBottom: 15 }} />
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 8, color: minimalColors.gray }}>{t("quoteNumber", lang)}: {quote.quote_number}</Text>
            <Text style={{ fontSize: 8, color: minimalColors.gray }}>{t("date", lang)}: {fmtDate(quote.quote_date)}</Text>
            <Text style={{ fontSize: 8, color: minimalColors.gray }}>{t("validUntil", lang)}: {fmtDate(quote.valid_until)}</Text>
          </View>
          <Text style={{ fontSize: 7, color: minimalColors.gray, marginTop: 10 }}>{settings.company_name} | {settings.address}, {settings.zip} {settings.city}</Text>
        </View>
      </Page>

      {/* References with photos (detailed only) */}
      {!isSimple && (photos.length > 0 || refs.length > 0) && (
        <Page size="A4" style={{ padding: 70, fontFamily: "Inter", fontSize: 9.5, color: minimalColors.black }}>
          <Text style={{ fontSize: 8, color: minimalColors.gray, textTransform: "uppercase", letterSpacing: 3, marginBottom: 20 }}>{t("references", lang)}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
            {(photos.length > 0 ? photos.slice(0, 4) : [null, null, null, null]).map((photo, idx) => {
              const ref = refs[idx];
              return (
                <View key={idx} style={{ width: "47%", marginBottom: 20 }}>
                  {photo ? (
                    <Image src={photo} style={{ width: "100%", height: 140, objectFit: "cover" }} />
                  ) : (
                    <View style={{ width: "100%", height: 140, backgroundColor: minimalColors.grayLight }} />
                  )}
                  {ref && <Text style={{ fontSize: 9, fontWeight: 600, marginTop: 8 }}>{ref.title}</Text>}
                  {ref && <Text style={{ fontSize: 8, color: minimalColors.gray, marginTop: 3, lineHeight: 1.5 }}>{ref.description}</Text>}
                </View>
              );
            })}
          </View>
        </Page>
      )}

      {/* Services (detailed only) */}
      {!isSimple && (
        <Page size="A4" style={{ padding: 70, fontFamily: "Inter", fontSize: 9.5, color: minimalColors.black }}>
          <Text style={{ fontSize: 8, color: minimalColors.gray, textTransform: "uppercase", letterSpacing: 3, marginBottom: 20 }}>{t("serviceScope", lang)}</Text>
          <Text style={{ fontSize: 16, fontWeight: 700, color: minimalColors.black, marginBottom: 25 }}>{quote.project_description || t("projectServices", lang)}</Text>
          {quote.notes && <Text style={{ fontSize: 9.5, color: minimalColors.gray, lineHeight: 1.7, marginBottom: 25 }}>{quote.notes}</Text>}
          {quote.items.map((item, idx) => (
            <View key={idx} style={{ paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: minimalColors.border }}>
              <Text style={{ fontSize: 10, fontWeight: 600, color: minimalColors.black }}>{item.description}</Text>
              <Text style={{ fontSize: 8.5, color: minimalColors.gray, marginTop: 3 }}>{item.quantity} {unitLabel(item.unit, lang)} x {fmtEuro(item.unit_price)}</Text>
            </View>
          ))}
        </Page>
      )}

      {/* Pricing */}
      <Page size="A4" style={{ paddingTop: 70, paddingBottom: 60, paddingHorizontal: 70, fontFamily: "Inter", fontSize: 9.5, color: minimalColors.black }}>
        <Text style={{ fontSize: 8, color: minimalColors.gray, textTransform: "uppercase", letterSpacing: 3, marginBottom: 20 }}>{t("pricingOverview", lang)}</Text>
        <PricingTable quote={quote} settings={settings} lang={lang} colors={{ accent: minimalColors.accent, black: minimalColors.black, white: minimalColors.white, gray: minimalColors.gray, border: minimalColors.border, bg: minimalColors.grayLight }} />
      </Page>

      {/* Closing (detailed only) */}
      {!isSimple && (
        <Page size="A4" style={{ padding: 70, fontFamily: "Inter", justifyContent: "center", alignItems: "center" }}>
          {settings.logo_url ? <Image src={settings.logo_url} style={{ width: 100, height: 40, objectFit: "contain", marginBottom: 30 }} /> : null}
          <View style={{ height: 0.5, backgroundColor: minimalColors.border, width: 150, marginBottom: 30 }} />
          <Text style={{ fontSize: 20, fontWeight: 700, color: minimalColors.black, textAlign: "center", lineHeight: 1.4 }}>{t("closingText", lang)}</Text>
          <View style={{ height: 0.5, backgroundColor: minimalColors.border, width: 150, marginTop: 30, marginBottom: 20 }} />
          <Text style={{ fontSize: 9, color: minimalColors.gray, textAlign: "center" }}>{settings.company_name}</Text>
          <Text style={{ fontSize: 9, color: minimalColors.gray, textAlign: "center", marginTop: 4 }}>{settings.phone} | {settings.email}</Text>
        </Page>
      )}
    </Document>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DESIGN 3: CLASSIC — Elegant cream/white with gold accents (replaces dark classic)
// ═══════════════════════════════════════════════════════════════════════════════

const classicColors = {
  bg: "#FEFEFE",
  offWhite: "#FAF9F7",
  dark: "#1C1917",
  gold: "#C9A84C",
  goldLight: "#FBF5E6",
  gray: "#78716C",
  grayLight: "#F5F4F0",
  border: "#E7E5E4",
  white: "#FFFFFF",
};

function ClassicDesign({ quote, customer, settings, references, photoUrls }: DesignProps) {
  const lang = quote.language || "de";
  const isSimple = quote.display_mode === "simple";
  const refs = references || [];
  const photos = photoUrls || [];

  return (
    <Document>
      {/* Cover */}
      <Page size="A4" style={{ backgroundColor: classicColors.bg, fontFamily: "Inter", padding: 0 }}>
        {/* Gold top stripe */}
        <View style={{ height: 6, backgroundColor: classicColors.gold }} />
        {/* Header with logo + company */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingHorizontal: 55, paddingTop: 30, paddingBottom: 25 }}>
          {settings.logo_url
            ? <Image src={settings.logo_url} style={{ width: 120, height: 50, objectFit: "contain" }} />
            : <Text style={{ fontSize: 13, fontWeight: 700, color: classicColors.dark }}>{settings.company_name}</Text>
          }
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 8, color: classicColors.gray }}>{settings.company_name}</Text>
            <Text style={{ fontSize: 8, color: classicColors.gray }}>{settings.address}</Text>
            <Text style={{ fontSize: 8, color: classicColors.gray }}>{settings.zip} {settings.city}</Text>
          </View>
        </View>
        {/* Thin gold separator */}
        <View style={{ height: 0.5, backgroundColor: classicColors.border, marginHorizontal: 55 }} />

        {/* Hero block */}
        <View style={{ paddingHorizontal: 55, paddingTop: 60, paddingBottom: 50 }}>
          <Text style={{ fontSize: 9, color: classicColors.gold, textTransform: "uppercase", letterSpacing: 4, marginBottom: 18 }}>{t("quote", lang)}</Text>
          <View style={{ height: 1, backgroundColor: classicColors.gold, width: 50, marginBottom: 28 }} />
          <Text style={{ fontSize: 30, fontWeight: 700, color: classicColors.dark, lineHeight: 1.25, marginBottom: 20 }}>
            {quote.project_description || (lang === "de" ? "Projektangebot" : "Project Quote")}
          </Text>
          <Text style={{ fontSize: 12, color: classicColors.gray, marginBottom: 5 }}>{t("forClient", lang)}</Text>
          <Text style={{ fontSize: 16, fontWeight: 600, color: classicColors.dark }}>{customer.company || customer.name}</Text>
        </View>

        {/* Info cards row */}
        <View style={{ flexDirection: "row", marginHorizontal: 55, gap: 12, marginTop: 20 }}>
          {[
            { label: t("quoteNumber", lang), value: quote.quote_number },
            { label: t("date", lang), value: fmtDate(quote.quote_date) },
            { label: t("validUntil", lang), value: fmtDate(quote.valid_until) },
          ].map((item, idx) => (
            <View key={idx} style={{ flex: 1, borderWidth: 1, borderColor: classicColors.gold, borderTopWidth: 3, borderTopColor: classicColors.gold, padding: 14, backgroundColor: classicColors.goldLight }}>
              <Text style={{ fontSize: 7.5, color: classicColors.gold, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 }}>{item.label}</Text>
              <Text style={{ fontSize: 11, fontWeight: 600, color: classicColors.dark }}>{item.value}</Text>
            </View>
          ))}
        </View>

        {/* Bottom gold stripe */}
        <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, backgroundColor: classicColors.gold }} />
      </Page>

      {/* About / References (detailed only) */}
      {!isSimple && (
        <Page size="A4" style={{ backgroundColor: classicColors.bg, fontFamily: "Inter", fontSize: 9.5, color: classicColors.dark, paddingTop: 50, paddingBottom: 60, paddingHorizontal: 55 }}>
          <View style={{ position: "absolute", top: 0, left: 0, width: 3, height: "100%", backgroundColor: classicColors.gold }} />
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 14, borderBottomWidth: 0.5, borderBottomColor: classicColors.border, marginBottom: 28 }}>
            {settings.logo_url ? <Image src={settings.logo_url} style={{ width: 80, height: 35, objectFit: "contain" }} /> : <View />}
            <Text style={{ fontSize: 7.5, color: classicColors.gray, textTransform: "uppercase", letterSpacing: 2 }}>{t("aboutUs", lang)}</Text>
          </View>

          <Text style={{ fontSize: 8, color: classicColors.gold, textTransform: "uppercase", letterSpacing: 3, marginBottom: 10 }}>{t("aboutUs", lang)}</Text>
          <Text style={{ fontSize: 20, fontWeight: 700, color: classicColors.dark, marginBottom: 14, lineHeight: 1.3 }}>{t("aboutUsTitle", lang)}</Text>
          <Text style={{ fontSize: 9.5, color: classicColors.gray, lineHeight: 1.8, marginBottom: 30 }}>{t("aboutUsBody", lang)}</Text>

          {(photos.length > 0 || refs.length > 0) && (
            <>
              <Text style={{ fontSize: 8, color: classicColors.gold, textTransform: "uppercase", letterSpacing: 3, marginBottom: 14 }}>{t("references", lang)}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
                {(photos.length > 0 ? photos.slice(0, 4) : [null, null, null, null]).map((photo, idx) => {
                  const ref = refs[idx];
                  return (
                    <View key={idx} style={{ width: "47%", marginBottom: 18 }}>
                      {photo
                        ? <Image src={photo} style={{ width: "100%", height: 120, objectFit: "cover" }} />
                        : <View style={{ width: "100%", height: 120, backgroundColor: classicColors.grayLight, borderTopWidth: 3, borderTopColor: classicColors.gold }} />
                      }
                      {ref && <Text style={{ fontSize: 10, fontWeight: 600, marginTop: 7, color: classicColors.dark }}>{ref.title}</Text>}
                      {ref && <Text style={{ fontSize: 8.5, color: classicColors.gray, marginTop: 3, lineHeight: 1.5 }}>{ref.description}</Text>}
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </Page>
      )}

      {/* Services (detailed only) */}
      {!isSimple && (
        <Page size="A4" style={{ backgroundColor: classicColors.bg, fontFamily: "Inter", fontSize: 9.5, color: classicColors.dark, paddingTop: 50, paddingBottom: 60, paddingHorizontal: 55 }}>
          <View style={{ position: "absolute", top: 0, left: 0, width: 3, height: "100%", backgroundColor: classicColors.gold }} />
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 14, borderBottomWidth: 0.5, borderBottomColor: classicColors.border, marginBottom: 28 }}>
            {settings.logo_url ? <Image src={settings.logo_url} style={{ width: 80, height: 35, objectFit: "contain" }} /> : <View />}
            <Text style={{ fontSize: 7.5, color: classicColors.gray, textTransform: "uppercase", letterSpacing: 2 }}>{t("serviceScope", lang)}</Text>
          </View>

          <Text style={{ fontSize: 8, color: classicColors.gold, textTransform: "uppercase", letterSpacing: 3, marginBottom: 10 }}>{t("serviceScope", lang)}</Text>
          <Text style={{ fontSize: 20, fontWeight: 700, color: classicColors.dark, marginBottom: 14, lineHeight: 1.3 }}>
            {quote.project_description || t("projectServices", lang)}
          </Text>
          {quote.notes && (
            <Text style={{ fontSize: 9.5, color: classicColors.gray, lineHeight: 1.8, marginBottom: 24 }}>{quote.notes}</Text>
          )}
          {quote.items.map((item, idx) => (
            <View key={idx} style={{ flexDirection: "row", alignItems: "flex-start", paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: classicColors.border }}>
              <View style={{ width: 28, height: 28, backgroundColor: classicColors.goldLight, borderWidth: 1, borderColor: classicColors.gold, justifyContent: "center", alignItems: "center", marginRight: 14 }}>
                <Text style={{ fontSize: 9, fontWeight: 700, color: classicColors.gold }}>{item.position}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, fontWeight: 600, color: classicColors.dark }}>{item.description}</Text>
                <Text style={{ fontSize: 8.5, color: classicColors.gray, marginTop: 3 }}>
                  {item.quantity} {unitLabel(item.unit, lang)} × {fmtEuro(item.unit_price)}
                </Text>
              </View>
              <Text style={{ fontSize: 10, fontWeight: 600, color: classicColors.dark }}>{fmtEuro(item.total)}</Text>
            </View>
          ))}
        </Page>
      )}

      {/* Pricing */}
      <Page size="A4" style={{ backgroundColor: classicColors.bg, fontFamily: "Inter", fontSize: 9.5, color: classicColors.dark, paddingTop: 50, paddingBottom: 60, paddingHorizontal: 55 }}>
        <View style={{ position: "absolute", top: 0, left: 0, width: 3, height: "100%", backgroundColor: classicColors.gold }} />
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 14, borderBottomWidth: 0.5, borderBottomColor: classicColors.border, marginBottom: 28 }}>
          {settings.logo_url ? <Image src={settings.logo_url} style={{ width: 80, height: 35, objectFit: "contain" }} /> : <View />}
          <Text style={{ fontSize: 7.5, color: classicColors.gray, textTransform: "uppercase", letterSpacing: 2 }}>{t("pricingOverview", lang)}</Text>
        </View>
        <Text style={{ fontSize: 8, color: classicColors.gold, textTransform: "uppercase", letterSpacing: 3, marginBottom: 10 }}>{t("pricingOverview", lang)}</Text>
        <Text style={{ fontSize: 20, fontWeight: 700, color: classicColors.dark, marginBottom: 20 }}>{t("investmentOverview", lang)}</Text>
        <PricingTable quote={quote} settings={settings} lang={lang} colors={{ accent: classicColors.gold, black: classicColors.gold, white: classicColors.white, gray: classicColors.gray, border: classicColors.border, bg: classicColors.offWhite }} />
      </Page>

      {/* Closing (detailed only) */}
      {!isSimple && (
        <Page size="A4" style={{ backgroundColor: classicColors.bg, fontFamily: "Inter", justifyContent: "center", alignItems: "center", padding: 60 }}>
          <View style={{ height: 1, backgroundColor: classicColors.gold, width: 180, marginBottom: 35 }} />
          {settings.logo_url && (
            <Image src={settings.logo_url} style={{ width: 120, height: 50, objectFit: "contain", marginBottom: 30 }} />
          )}
          <Text style={{ fontSize: 22, fontWeight: 700, color: classicColors.dark, textAlign: "center", lineHeight: 1.5 }}>{t("closingText", lang)}</Text>
          <View style={{ height: 1, backgroundColor: classicColors.gold, width: 180, marginTop: 35, marginBottom: 25 }} />
          <Text style={{ fontSize: 10, fontWeight: 600, color: classicColors.gold, textAlign: "center" }}>{settings.company_name}</Text>
          <Text style={{ fontSize: 9, color: classicColors.gray, textAlign: "center", marginTop: 8, lineHeight: 1.7 }}>
            {settings.phone}{"\n"}{settings.email}{"\n"}{settings.address}, {settings.zip} {settings.city}
          </Text>
        </Page>
      )}
    </Document>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DESIGN 4: BOLD — Deep teal on white, split cover, professional
// ═══════════════════════════════════════════════════════════════════════════════

const boldColors = {
  teal: "#0F5257",
  tealLight: "#E8F4F4",
  tealMid: "#1A7A7A",
  white: "#FFFFFF",
  dark: "#0C1B1C",
  gray: "#64748B",
  grayLight: "#F1F5F9",
  border: "#E2E8F0",
};

function BoldDesign({ quote, customer, settings, references, photoUrls }: DesignProps) {
  const lang = quote.language || "de";
  const isSimple = quote.display_mode === "simple";
  const refs = references || [];
  const photos = photoUrls || [];

  return (
    <Document>
      {/* Cover — split: teal top / white bottom */}
      <Page size="A4" style={{ backgroundColor: boldColors.white, fontFamily: "Inter", padding: 0 }}>
        {/* Teal upper panel */}
        <View style={{ backgroundColor: boldColors.teal, paddingHorizontal: 50, paddingTop: 40, paddingBottom: 50 }}>
          {/* Logo row */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 50 }}>
            <View style={{ backgroundColor: boldColors.white, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 6 }}>
              {settings.logo_url
                ? <Image src={settings.logo_url} style={{ width: 100, height: 40, objectFit: "contain" }} />
                : <Text style={{ fontSize: 12, fontWeight: 700, color: boldColors.teal }}>{settings.company_name}</Text>
              }
            </View>
            <Text style={{ fontSize: 8, color: "#AACECE" }}>{settings.company_name}</Text>
          </View>
          {/* Title */}
          <Text style={{ fontSize: 9, color: "#AACECE", textTransform: "uppercase", letterSpacing: 4, marginBottom: 14 }}>{t("quote", lang)}</Text>
          <Text style={{ fontSize: 28, fontWeight: 700, color: boldColors.white, lineHeight: 1.3, marginBottom: 16 }}>
            {quote.project_description || (lang === "de" ? "Projektangebot" : "Project Quote")}
          </Text>
          <Text style={{ fontSize: 11, color: "#AACECE" }}>{t("forClient", lang)}: <Text style={{ color: boldColors.white, fontWeight: 600 }}>{customer.company || customer.name}</Text></Text>
        </View>

        {/* White lower panel */}
        <View style={{ paddingHorizontal: 50, paddingTop: 40 }}>
          <View style={{ flexDirection: "row", gap: 16 }}>
            {[
              { label: t("quoteNumber", lang), value: quote.quote_number },
              { label: t("date", lang), value: fmtDate(quote.quote_date) },
              { label: t("validUntil", lang), value: fmtDate(quote.valid_until) },
            ].map((item, idx) => (
              <View key={idx} style={{ flex: 1, backgroundColor: boldColors.tealLight, borderTopWidth: 3, borderTopColor: boldColors.teal, padding: 16 }}>
                <Text style={{ fontSize: 7.5, color: boldColors.tealMid, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 }}>{item.label}</Text>
                <Text style={{ fontSize: 11, fontWeight: 700, color: boldColors.dark }}>{item.value}</Text>
              </View>
            ))}
          </View>

          <View style={{ marginTop: 35, borderTopWidth: 0.5, borderTopColor: boldColors.border, paddingTop: 20 }}>
            <Text style={{ fontSize: 8, color: boldColors.gray }}>{settings.company_name} · {settings.address}, {settings.zip} {settings.city}</Text>
          </View>
        </View>
      </Page>

      {/* About / References (detailed only) */}
      {!isSimple && (
        <Page size="A4" style={{ backgroundColor: boldColors.white, fontFamily: "Inter", fontSize: 9.5, color: boldColors.dark, padding: 0 }}>
          {/* Teal top bar */}
          <View style={{ backgroundColor: boldColors.teal, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 50, paddingVertical: 16 }}>
            <View style={{ backgroundColor: boldColors.white, borderRadius: 3, paddingHorizontal: 8, paddingVertical: 5 }}>
              {settings.logo_url ? <Image src={settings.logo_url} style={{ width: 70, height: 30, objectFit: "contain" }} /> : null}
            </View>
            <Text style={{ fontSize: 8, color: "#AACECE", textTransform: "uppercase", letterSpacing: 2 }}>{t("aboutUs", lang)}</Text>
          </View>

          <View style={{ paddingHorizontal: 50, paddingTop: 30, paddingBottom: 50 }}>
            <Text style={{ fontSize: 8, color: boldColors.tealMid, textTransform: "uppercase", letterSpacing: 3, marginBottom: 10 }}>{t("aboutUs", lang)}</Text>
            <Text style={{ fontSize: 20, fontWeight: 700, color: boldColors.dark, marginBottom: 14, lineHeight: 1.3 }}>{t("aboutUsTitle", lang)}</Text>
            <Text style={{ fontSize: 9.5, color: boldColors.gray, lineHeight: 1.8, marginBottom: 28 }}>{t("aboutUsBody", lang)}</Text>

            {(photos.length > 0 || refs.length > 0) && (
              <>
                <Text style={{ fontSize: 8, color: boldColors.tealMid, textTransform: "uppercase", letterSpacing: 3, marginBottom: 14 }}>{t("references", lang)}</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
                  {(photos.length > 0 ? photos.slice(0, 4) : [null, null, null, null]).map((photo, idx) => {
                    const ref = refs[idx];
                    return (
                      <View key={idx} style={{ width: "47%", marginBottom: 18 }}>
                        {photo
                          ? <Image src={photo} style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 3 }} />
                          : <View style={{ width: "100%", height: 120, backgroundColor: boldColors.tealLight, borderTopWidth: 3, borderTopColor: boldColors.teal }} />
                        }
                        {ref && <Text style={{ fontSize: 10, fontWeight: 600, marginTop: 7, color: boldColors.dark }}>{ref.title}</Text>}
                        {ref && <Text style={{ fontSize: 8.5, color: boldColors.gray, marginTop: 3, lineHeight: 1.5 }}>{ref.description}</Text>}
                      </View>
                    );
                  })}
                </View>
              </>
            )}
          </View>
        </Page>
      )}

      {/* Services (detailed only) */}
      {!isSimple && (
        <Page size="A4" style={{ backgroundColor: boldColors.white, fontFamily: "Inter", fontSize: 9.5, color: boldColors.dark, padding: 0 }}>
          <View style={{ backgroundColor: boldColors.teal, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 50, paddingVertical: 16 }}>
            <View style={{ backgroundColor: boldColors.white, borderRadius: 3, paddingHorizontal: 8, paddingVertical: 5 }}>
              {settings.logo_url ? <Image src={settings.logo_url} style={{ width: 70, height: 30, objectFit: "contain" }} /> : null}
            </View>
            <Text style={{ fontSize: 8, color: "#AACECE", textTransform: "uppercase", letterSpacing: 2 }}>{t("serviceScope", lang)}</Text>
          </View>

          <View style={{ paddingHorizontal: 50, paddingTop: 30, paddingBottom: 50 }}>
            <Text style={{ fontSize: 8, color: boldColors.tealMid, textTransform: "uppercase", letterSpacing: 3, marginBottom: 10 }}>{t("serviceScope", lang)}</Text>
            <Text style={{ fontSize: 20, fontWeight: 700, color: boldColors.dark, marginBottom: 14, lineHeight: 1.3 }}>
              {quote.project_description || t("projectServices", lang)}
            </Text>
            {quote.notes && <Text style={{ fontSize: 9.5, color: boldColors.gray, lineHeight: 1.8, marginBottom: 24 }}>{quote.notes}</Text>}
            {quote.items.map((item, idx) => (
              <View key={idx} style={{ flexDirection: "row", alignItems: "flex-start", paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: boldColors.border }}>
                <View style={{ width: 28, height: 28, backgroundColor: boldColors.teal, justifyContent: "center", alignItems: "center", marginRight: 14, borderRadius: 3 }}>
                  <Text style={{ fontSize: 9, fontWeight: 700, color: boldColors.white }}>{item.position}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 10, fontWeight: 600, color: boldColors.dark }}>{item.description}</Text>
                  <Text style={{ fontSize: 8.5, color: boldColors.gray, marginTop: 3 }}>
                    {item.quantity} {unitLabel(item.unit, lang)} × {fmtEuro(item.unit_price)}
                  </Text>
                </View>
                <Text style={{ fontSize: 10, fontWeight: 600, color: boldColors.teal }}>{fmtEuro(item.total)}</Text>
              </View>
            ))}
          </View>
        </Page>
      )}

      {/* Pricing */}
      <Page size="A4" style={{ backgroundColor: boldColors.white, fontFamily: "Inter", fontSize: 9.5, color: boldColors.dark, padding: 0 }}>
        <View style={{ backgroundColor: boldColors.teal, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 50, paddingVertical: 16 }}>
          <View style={{ backgroundColor: boldColors.white, borderRadius: 3, paddingHorizontal: 8, paddingVertical: 5 }}>
            {settings.logo_url ? <Image src={settings.logo_url} style={{ width: 70, height: 30, objectFit: "contain" }} /> : null}
          </View>
          <Text style={{ fontSize: 8, color: "#AACECE", textTransform: "uppercase", letterSpacing: 2 }}>{t("pricingOverview", lang)}</Text>
        </View>
        <View style={{ paddingHorizontal: 50, paddingTop: 30, paddingBottom: 50 }}>
          <Text style={{ fontSize: 8, color: boldColors.tealMid, textTransform: "uppercase", letterSpacing: 3, marginBottom: 10 }}>{t("pricingOverview", lang)}</Text>
          <Text style={{ fontSize: 20, fontWeight: 700, color: boldColors.dark, marginBottom: 20 }}>{t("investmentOverview", lang)}</Text>
          <PricingTable quote={quote} settings={settings} lang={lang} colors={{ accent: boldColors.tealMid, black: boldColors.teal, white: boldColors.white, gray: boldColors.gray, border: boldColors.border, bg: boldColors.tealLight }} />
        </View>
      </Page>

      {/* Closing (detailed only) */}
      {!isSimple && (
        <Page size="A4" style={{ backgroundColor: boldColors.white, fontFamily: "Inter", padding: 0 }}>
          <View style={{ backgroundColor: boldColors.teal, height: 8 }} />
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 60 }}>
            {settings.logo_url && (
              <Image src={settings.logo_url} style={{ width: 120, height: 50, objectFit: "contain", marginBottom: 30 }} />
            )}
            <View style={{ backgroundColor: boldColors.tealLight, borderTopWidth: 4, borderTopColor: boldColors.teal, padding: 30, alignItems: "center", width: "100%" }}>
              <Text style={{ fontSize: 22, fontWeight: 700, color: boldColors.dark, textAlign: "center", lineHeight: 1.5, marginBottom: 20 }}>{t("closingText", lang)}</Text>
              <Text style={{ fontSize: 10, fontWeight: 600, color: boldColors.teal, textAlign: "center" }}>{settings.company_name}</Text>
              <Text style={{ fontSize: 9, color: boldColors.gray, textAlign: "center", marginTop: 8, lineHeight: 1.7 }}>
                {settings.phone} · {settings.email}
              </Text>
              <Text style={{ fontSize: 8.5, color: boldColors.gray, textAlign: "center", marginTop: 4 }}>
                {settings.address}, {settings.zip} {settings.city}
              </Text>
            </View>
          </View>
          <View style={{ backgroundColor: boldColors.teal, height: 4 }} />
        </Page>
      )}
    </Document>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DESIGN 5: AI CUSTOM — cover + intro driven by Opus 4.7 payload
// ═══════════════════════════════════════════════════════════════════════════════

interface AiDesignProps extends DesignProps {
  aiPayload: QuoteDesignAIPayload;
}

function AiCustomDesign({ quote, customer, settings, references, photoUrls, aiPayload }: AiDesignProps) {
  const lang = quote.language || "de";
  const isSimple = quote.display_mode === "simple";
  const refs = references || [];
  const photos = photoUrls || [];

  const palette = aiPayload.recommendedPalette;
  const colors = {
    accent: palette.accent,
    accentLight: palette.accentLight,
    dark: palette.dark,
    bg: palette.bg,
    white: "#FFFFFF",
    gray: "#64748B",
    grayLight: "#F1F5F9",
    border: "#E2E8F0",
  };

  return (
    <Document>
      {/* Cover — AI-generated hero */}
      <Page size="A4" style={{ backgroundColor: colors.bg, fontFamily: "Inter", padding: 0 }}>
        <View style={{ height: 6, backgroundColor: colors.accent }} />

        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingHorizontal: 55, paddingTop: 30, paddingBottom: 22 }}>
          {settings.logo_url
            ? <Image src={settings.logo_url} style={{ width: 120, height: 50, objectFit: "contain" }} />
            : <Text style={{ fontSize: 13, fontWeight: 700, color: colors.dark }}>{settings.company_name}</Text>}
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 8, color: colors.gray }}>{settings.company_name}</Text>
            <Text style={{ fontSize: 8, color: colors.gray }}>{settings.address}</Text>
            <Text style={{ fontSize: 8, color: colors.gray }}>{settings.zip} {settings.city}</Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: 55, paddingTop: 30 }}>
          <Text style={{ fontSize: 9, color: colors.accent, textTransform: "uppercase", letterSpacing: 4, marginBottom: 14 }}>{aiPayload.coverTagline}</Text>
          <View style={{ height: 2, backgroundColor: colors.accent, width: 56, marginBottom: 22 }} />
          <Text style={{ fontSize: 30, fontWeight: 700, color: colors.dark, lineHeight: 1.22, marginBottom: 14 }}>{aiPayload.coverTitle}</Text>
          {aiPayload.coverSubtitle ? (
            <Text style={{ fontSize: 13, color: colors.gray, lineHeight: 1.55, marginBottom: 24 }}>{aiPayload.coverSubtitle}</Text>
          ) : null}
          <Text style={{ fontSize: 11, color: colors.gray, marginBottom: 4 }}>{t("forClient", lang)}</Text>
          <Text style={{ fontSize: 15, fontWeight: 600, color: colors.dark }}>{customer.company || customer.name}</Text>
        </View>

        <View style={{ backgroundColor: colors.accentLight, marginTop: 30, marginHorizontal: 55, padding: 18, borderLeftWidth: 3, borderLeftColor: colors.accent }}>
          <Text style={{ fontSize: 10.5, color: colors.dark, lineHeight: 1.65 }}>{aiPayload.introText}</Text>
        </View>

        <View style={{ flexDirection: "row", marginHorizontal: 55, gap: 12, marginTop: 26 }}>
          {[
            { label: t("quoteNumber", lang), value: quote.quote_number },
            { label: t("date", lang), value: fmtDate(quote.quote_date) },
            { label: t("validUntil", lang), value: fmtDate(quote.valid_until) },
          ].map((item, idx) => (
            <View key={idx} style={{ flex: 1, borderTopWidth: 3, borderTopColor: colors.accent, backgroundColor: colors.accentLight, padding: 12 }}>
              <Text style={{ fontSize: 7.5, color: colors.accent, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 5 }}>{item.label}</Text>
              <Text style={{ fontSize: 11, fontWeight: 700, color: colors.dark }}>{item.value}</Text>
            </View>
          ))}
        </View>

        <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, backgroundColor: colors.accent }} />
      </Page>

      {/* About / References (detailed only) */}
      {!isSimple && (photos.length > 0 || refs.length > 0) && (
        <Page size="A4" style={{ backgroundColor: colors.bg, fontFamily: "Inter", paddingTop: 50, paddingBottom: 60, paddingHorizontal: 55 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 14, borderBottomWidth: 0.5, borderBottomColor: colors.border, marginBottom: 28 }}>
            {settings.logo_url ? <Image src={settings.logo_url} style={{ width: 80, height: 35, objectFit: "contain" }} /> : <View />}
            <Text style={{ fontSize: 7.5, color: colors.gray, textTransform: "uppercase", letterSpacing: 2 }}>{t("references", lang)}</Text>
          </View>
          <Text style={{ fontSize: 8, color: colors.accent, textTransform: "uppercase", letterSpacing: 3, marginBottom: 14 }}>{t("references", lang)}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
            {(photos.length > 0 ? photos.slice(0, 4) : [null, null, null, null]).map((photo, idx) => {
              const ref = refs[idx];
              return (
                <View key={idx} style={{ width: "47%", marginBottom: 18 }}>
                  {photo
                    ? <Image src={photo} style={{ width: "100%", height: 120, objectFit: "cover" }} />
                    : <View style={{ width: "100%", height: 120, backgroundColor: colors.accentLight, borderTopWidth: 3, borderTopColor: colors.accent }} />}
                  {ref && <Text style={{ fontSize: 10, fontWeight: 600, marginTop: 7, color: colors.dark }}>{ref.title}</Text>}
                  {ref && <Text style={{ fontSize: 8.5, color: colors.gray, marginTop: 3, lineHeight: 1.5 }}>{ref.description}</Text>}
                </View>
              );
            })}
          </View>
        </Page>
      )}

      {/* Services (detailed only) */}
      {!isSimple && (
        <Page size="A4" style={{ backgroundColor: colors.bg, fontFamily: "Inter", paddingTop: 50, paddingBottom: 60, paddingHorizontal: 55 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 14, borderBottomWidth: 0.5, borderBottomColor: colors.border, marginBottom: 28 }}>
            {settings.logo_url ? <Image src={settings.logo_url} style={{ width: 80, height: 35, objectFit: "contain" }} /> : <View />}
            <Text style={{ fontSize: 7.5, color: colors.gray, textTransform: "uppercase", letterSpacing: 2 }}>{t("serviceScope", lang)}</Text>
          </View>
          <Text style={{ fontSize: 8, color: colors.accent, textTransform: "uppercase", letterSpacing: 3, marginBottom: 10 }}>{t("serviceScope", lang)}</Text>
          <Text style={{ fontSize: 20, fontWeight: 700, color: colors.dark, marginBottom: 14, lineHeight: 1.3 }}>{quote.project_description || t("projectServices", lang)}</Text>
          {quote.notes && <Text style={{ fontSize: 9.5, color: colors.gray, lineHeight: 1.8, marginBottom: 24 }}>{quote.notes}</Text>}
          {quote.items.map((item, idx) => (
            <View key={idx} style={{ flexDirection: "row", alignItems: "flex-start", paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
              <View style={{ width: 28, height: 28, backgroundColor: colors.accent, justifyContent: "center", alignItems: "center", marginRight: 14 }}>
                <Text style={{ fontSize: 9, fontWeight: 700, color: colors.white }}>{item.position}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, fontWeight: 600, color: colors.dark }}>{item.description}</Text>
                <Text style={{ fontSize: 8.5, color: colors.gray, marginTop: 3 }}>{item.quantity} {unitLabel(item.unit, lang)} × {fmtEuro(item.unit_price)}</Text>
              </View>
              <Text style={{ fontSize: 10, fontWeight: 600, color: colors.accent }}>{fmtEuro(item.total)}</Text>
            </View>
          ))}
        </Page>
      )}

      {/* Pricing */}
      <Page size="A4" style={{ backgroundColor: colors.bg, fontFamily: "Inter", fontSize: 9.5, color: colors.dark, paddingTop: 50, paddingBottom: 60, paddingHorizontal: 55 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 14, borderBottomWidth: 0.5, borderBottomColor: colors.border, marginBottom: 28 }}>
          {settings.logo_url ? <Image src={settings.logo_url} style={{ width: 80, height: 35, objectFit: "contain" }} /> : <View />}
          <Text style={{ fontSize: 7.5, color: colors.gray, textTransform: "uppercase", letterSpacing: 2 }}>{t("pricingOverview", lang)}</Text>
        </View>
        <Text style={{ fontSize: 8, color: colors.accent, textTransform: "uppercase", letterSpacing: 3, marginBottom: 10 }}>{t("pricingOverview", lang)}</Text>
        <Text style={{ fontSize: 20, fontWeight: 700, color: colors.dark, marginBottom: 20 }}>{t("investmentOverview", lang)}</Text>
        <PricingTable quote={quote} settings={settings} lang={lang} colors={{ accent: colors.accent, black: colors.dark, white: colors.white, gray: colors.gray, border: colors.border, bg: colors.accentLight }} />
      </Page>

      {/* Closing (detailed only) */}
      {!isSimple && (
        <Page size="A4" style={{ backgroundColor: colors.bg, fontFamily: "Inter", justifyContent: "center", alignItems: "center", padding: 60 }}>
          <View style={{ height: 1, backgroundColor: colors.accent, width: 180, marginBottom: 35 }} />
          {settings.logo_url && (
            <Image src={settings.logo_url} style={{ width: 120, height: 50, objectFit: "contain", marginBottom: 30 }} />
          )}
          <Text style={{ fontSize: 22, fontWeight: 700, color: colors.dark, textAlign: "center", lineHeight: 1.5 }}>{t("closingText", lang)}</Text>
          <View style={{ height: 1, backgroundColor: colors.accent, width: 180, marginTop: 35, marginBottom: 25 }} />
          <Text style={{ fontSize: 10, fontWeight: 600, color: colors.accent, textAlign: "center" }}>{settings.company_name}</Text>
          <Text style={{ fontSize: 9, color: colors.gray, textAlign: "center", marginTop: 8, lineHeight: 1.7 }}>
            {settings.phone}{"\n"}{settings.email}{"\n"}{settings.address}, {settings.zip} {settings.city}
          </Text>
        </Page>
      )}
    </Document>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTER: Picks the right design based on designKey
// ═══════════════════════════════════════════════════════════════════════════════

interface QuotePDFDesignProps {
  designKey: QuoteDesignKey;
  quote: Quote;
  customer: Customer;
  settings: CompanySettings;
  references?: Reference[];
  photoUrls?: string[];
  aiPayload?: QuoteDesignAIPayload | null;
}

export default function QuotePDFDesign({ designKey, aiPayload, ...props }: QuotePDFDesignProps) {
  switch (designKey) {
    case "modern":
      return <ModernDesign {...props} />;
    case "minimal":
      return <MinimalDesign {...props} />;
    case "bold":
      return <BoldDesign {...props} />;
    case "ai_custom":
      // Fallback to Minimal when the payload is missing (SCH-562 fallback clause)
      return aiPayload
        ? <AiCustomDesign {...props} aiPayload={aiPayload} />
        : <MinimalDesign {...props} />;
    case "classic":
    default:
      return <ClassicDesign {...props} />;
  }
}
