// SCH-889: unit tests for the per-card CTA resolver.
//
// Plan rank in PLANS is starter (0) → business (1) → pro (2). The matrix
// below covers every active × card combination plus the no-active-plan
// (trial / fresh) variants the issue calls out.

import { describe, it, expect } from "vitest";
import { getActivePlanIndex, getCardCta } from "@/lib/subscription-cta";
import { PLANS } from "@/lib/plans";

describe("getActivePlanIndex", () => {
  it("returns -1 for null/undefined", () => {
    expect(getActivePlanIndex(null)).toBe(-1);
    expect(getActivePlanIndex(undefined)).toBe(-1);
  });

  it("returns the PLANS index for each plan key", () => {
    expect(getActivePlanIndex("starter")).toBe(0);
    expect(getActivePlanIndex("business")).toBe(1);
    expect(getActivePlanIndex("pro")).toBe(2);
  });

  it("matches PLANS array order so the matrix tests stay in sync", () => {
    expect(PLANS.map((p) => p.key)).toEqual(["starter", "business", "pro"]);
  });
});

describe("getCardCta — 3×3 active-plan matrix", () => {
  // active = starter (idx 0)
  it("starter active → starter card = Verwalten", () => {
    expect(getCardCta(0, 0, true)).toEqual({ label: "Verwalten", action: "manage", isActive: true });
  });
  it("starter active → business card = Upgrade", () => {
    expect(getCardCta(0, 1, true)).toEqual({ label: "Upgrade", action: "upgrade", isActive: false });
  });
  it("starter active → pro card = Upgrade", () => {
    expect(getCardCta(0, 2, true)).toEqual({ label: "Upgrade", action: "upgrade", isActive: false });
  });

  // active = business (idx 1)
  it("business active → starter card = Downgrade", () => {
    expect(getCardCta(1, 0, true)).toEqual({ label: "Downgrade", action: "downgrade", isActive: false });
  });
  it("business active → business card = Verwalten", () => {
    expect(getCardCta(1, 1, true)).toEqual({ label: "Verwalten", action: "manage", isActive: true });
  });
  it("business active → pro card = Upgrade", () => {
    expect(getCardCta(1, 2, true)).toEqual({ label: "Upgrade", action: "upgrade", isActive: false });
  });

  // active = pro (idx 2)
  it("pro active → starter card = Downgrade", () => {
    expect(getCardCta(2, 0, true)).toEqual({ label: "Downgrade", action: "downgrade", isActive: false });
  });
  it("pro active → business card = Downgrade", () => {
    expect(getCardCta(2, 1, true)).toEqual({ label: "Downgrade", action: "downgrade", isActive: false });
  });
  it("pro active → pro card = Verwalten", () => {
    expect(getCardCta(2, 2, true)).toEqual({ label: "Verwalten", action: "manage", isActive: true });
  });
});

describe("getCardCta — no active plan (trial / free / cancelled)", () => {
  it("renders 'Upgraden' on every card when there is no active sub", () => {
    for (let cardIdx = 0; cardIdx < 3; cardIdx++) {
      expect(getCardCta(-1, cardIdx, false)).toEqual({
        label: "Upgraden",
        action: "subscribe",
        isActive: false,
      });
    }
  });

  it("falls back to 'Plan wechseln' when paid but plan_key not yet synced (legacy pre-SCH-889)", () => {
    for (let cardIdx = 0; cardIdx < 3; cardIdx++) {
      expect(getCardCta(-1, cardIdx, true)).toEqual({
        label: "Plan wechseln",
        action: "upgrade",
        isActive: false,
      });
    }
  });
});
