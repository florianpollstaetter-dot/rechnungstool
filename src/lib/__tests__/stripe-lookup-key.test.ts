// SCH-889: lookup_key format guards. The Stripe webhook persists the parsed
// plan/interval into companies.subscription_plan / subscription_interval,
// so a bad parse means the UI silently mislabels the card. These tests are
// the single source of truth for what the parser accepts.

import { describe, it, expect } from "vitest";
import { parseStripeLookupKey } from "@/lib/stripe-lookup-key";

describe("parseStripeLookupKey", () => {
  it("parses every valid plan × interval combo", () => {
    expect(parseStripeLookupKey("rechnungstool_starter_month")).toEqual({ plan: "starter", interval: "month" });
    expect(parseStripeLookupKey("rechnungstool_starter_year")).toEqual({ plan: "starter", interval: "year" });
    expect(parseStripeLookupKey("rechnungstool_business_month")).toEqual({ plan: "business", interval: "month" });
    expect(parseStripeLookupKey("rechnungstool_business_year")).toEqual({ plan: "business", interval: "year" });
    expect(parseStripeLookupKey("rechnungstool_pro_month")).toEqual({ plan: "pro", interval: "month" });
    expect(parseStripeLookupKey("rechnungstool_pro_year")).toEqual({ plan: "pro", interval: "year" });
  });

  it("returns null for null / undefined / empty", () => {
    expect(parseStripeLookupKey(null)).toBeNull();
    expect(parseStripeLookupKey(undefined)).toBeNull();
    expect(parseStripeLookupKey("")).toBeNull();
  });

  it("rejects wrong prefix, plan, or interval", () => {
    expect(parseStripeLookupKey("otherapp_pro_month")).toBeNull();
    expect(parseStripeLookupKey("rechnungstool_enterprise_month")).toBeNull();
    expect(parseStripeLookupKey("rechnungstool_pro_quarter")).toBeNull();
  });

  it("rejects malformed segment counts", () => {
    expect(parseStripeLookupKey("rechnungstool_pro")).toBeNull();
    expect(parseStripeLookupKey("rechnungstool_pro_month_extra")).toBeNull();
    expect(parseStripeLookupKey("rechnungstool")).toBeNull();
  });
});
