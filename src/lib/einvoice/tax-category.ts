/**
 * ORA-3313 — Central VAT category derivation for EN 16931 e-invoices (UBL + CII).
 *
 * The UNCL5305 category code and its exemption reason (BT-118 / BT-120) must be
 * derived from the invoice, customer and company settings — not guessed from the
 * tax rate alone. This module is the single source of truth, shared by the UBL
 * (XRechnung) and CII (ZUGFeRD / Factur-X) generators so both stay in lockstep.
 *
 * Categories we emit:
 *   S  — Standard rate (rate > 0). The ordinary case.
 *   Z  — Zero rated (rate 0, no special regime). Austrian 0 % Normalsteuer.
 *   E  — Exempt: Kleinunternehmer (AT § 6 Abs. 1 Z 27 UStG / DE § 19 UStG).
 *   AE — Reverse charge: cross-border B2B services inside the EU (customer has a
 *        UID in a different EU member state). "Übergang der Steuerschuld".
 *   K  — Intra-community supply of goods (VAT-exempt). Needs an explicit goods
 *        signal because our data model cannot tell goods from services.
 *
 * EN 16931 rule note: for every exempt / reverse-charge / zero category the rate
 * must be 0 and a VAT breakdown (BG-23) exemption reason is required for E/AE/K.
 * The exemption reason belongs ONLY in the document-level VAT breakdown, never on
 * the invoice line (BG-30 carries code + rate only).
 */
import { Language } from "../types";
import { EInvoiceData } from "./types";
import { kleinunternehmerNote, t } from "../i18n";

/** UNCL5305 duty/tax/fee category codes we support. */
export type TaxCategoryCode = "S" | "Z" | "E" | "AE" | "K";

export interface TaxCategory {
  /** UNCL5305 code → UBL cbc:ID / CII ram:CategoryCode. */
  code: TaxCategoryCode;
  /**
   * BT-120 exemption reason text → UBL cbc:TaxExemptionReason /
   * CII ram:ExemptionReason. Empty string for S and Z (no reason element).
   */
  exemptionReason: string;
}

/**
 * EU member states (ISO-3166-1 alpha-2). Used to decide whether a customer UID
 * in a *different* country triggers the intra-EU B2B regime (AE / K). Non-EU
 * countries never do — an export is out of scope here and falls through to Z/S.
 */
export const EU_MEMBER_STATES: ReadonlySet<string> = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE",
]);

/**
 * Context needed to derive the category. Built once from EInvoiceData by
 * {@link taxCategoryContext}; kept small so unit tests can construct it directly.
 */
export interface TaxCategoryContext {
  sellerCountry: string;
  isKleinunternehmer: boolean;
  buyerCountry: string;
  buyerUid: string;
  lang: Language;
  /**
   * Whether the cross-border EU supply is physical goods ("goods" → category K)
   * or a service ("services" → reverse charge AE). Undefined defaults to
   * "services" because this tool invoices services by default and our data model
   * carries no goods/services marker yet. Set explicitly to emit K.
   */
  supply?: "goods" | "services";
}

function norm(country: string | undefined): string {
  return (country || "").trim().toUpperCase();
}

/** Build the derivation context from the full e-invoice payload. */
export function taxCategoryContext(data: EInvoiceData): TaxCategoryContext {
  const { invoice, customer, settings } = data;
  return {
    sellerCountry: norm(settings.country) || "AT",
    isKleinunternehmer: settings.is_kleinunternehmer === true,
    buyerCountry: norm(customer.country) || "AT",
    buyerUid: (customer.uid_number || "").trim(),
    lang: invoice.language || "de",
    supply: data.supply,
  };
}

/**
 * True when the customer is a VAT-registered business in a *different* EU member
 * state than the seller — the trigger for reverse charge (AE) or intra-community
 * supply (K).
 */
function isCrossBorderEuB2B(ctx: TaxCategoryContext): boolean {
  if (!ctx.buyerUid) return false;
  if (!EU_MEMBER_STATES.has(ctx.sellerCountry)) return false;
  if (!EU_MEMBER_STATES.has(ctx.buyerCountry)) return false;
  return ctx.buyerCountry !== ctx.sellerCountry;
}

/**
 * Derive the tax category for a single VAT-breakdown rate group.
 *
 * `rate` is the effective per-rate percentage (e.g. 20, 10, 0). A positive rate
 * is always Standard (S) — the special regimes (E/AE/K) only ever apply at 0 %.
 * At 0 % we pick the first matching regime, else plain zero-rated (Z).
 */
export function deriveTaxCategory(rate: number, ctx: TaxCategoryContext): TaxCategory {
  if (rate > 0) {
    return { code: "S", exemptionReason: "" };
  }

  // rate === 0 (or negative, treated as zero) from here.
  if (ctx.isKleinunternehmer) {
    return { code: "E", exemptionReason: kleinunternehmerNote(ctx.sellerCountry, ctx.lang) };
  }

  if (isCrossBorderEuB2B(ctx)) {
    if (ctx.supply === "goods") {
      return { code: "K", exemptionReason: t("intraCommunitySupplyNote", ctx.lang) };
    }
    return { code: "AE", exemptionReason: t("reverseChargeNote", ctx.lang) };
  }

  return { code: "Z", exemptionReason: "" };
}
