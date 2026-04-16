/**
 * Legal-page config for the operator of this instance (VR the Fans GmbH).
 * Per-tenant company_settings can override these later — for now defaults
 * come from the codebase, with env-var overrides for the placeholders the
 * GF must supply (Firmenbuchnummer, Geschäftsführer, DSB-Mail).
 */
export const LEGAL_OPERATOR = {
  companyName: "VR the Fans GmbH",
  legalForm: "Gesellschaft mit beschränkter Haftung (GmbH)",
  street: "Gastgebgasse 3/243",
  city: "Wien",
  zip: "1230",
  country: "Österreich",
  uid: "ATU82587808",
  registerCourt: "Handelsgericht Wien",
  phone: "+43 664 389 91 38",
  email: "office@vrthefans.com",
  product: "Orange Octo — easy accounting",
  // GF/Firmenbuch values are not public — placeholder until env vars are set.
  registerNumber:
    process.env.NEXT_PUBLIC_LEGAL_FIRMENBUCH ?? "[wird ergänzt]",
  managingDirector:
    process.env.NEXT_PUBLIC_LEGAL_GF_NAME ?? "[wird ergänzt]",
  dsbEmail:
    process.env.NEXT_PUBLIC_LEGAL_DSB_EMAIL ?? "office@vrthefans.com",
  legalDocsRevision: "April 2026",
} as const;
