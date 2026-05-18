// ORA-2308 — Bank-Connector preset metadata used by the client wizard step.
//
// Kept colocated with the wizard (rather than imported from
// `lib/treasury/ebics/setup.ts`) to keep the client bundle free of the
// server-only sidecar dependencies — `setup.ts` reaches into
// `@supabase/supabase-js` service clients which must not ship to the
// browser. The list itself is static config so duplicating it is cheap.

import type { EbicsBankPreset, EbicsVersion } from "@/lib/treasury/types";

export interface BankPresetDescriptor {
  preset: EbicsBankPreset;
  bankName: string;
  hostUrl: string;
  hostId: string;
  ebicsVersion: EbicsVersion;
}

export const BANK_PRESETS: ReadonlyArray<BankPresetDescriptor> = [
  {
    preset: "erste",
    bankName: "Erste Bank Wien",
    hostUrl: "https://ebics.erstebank.at/ebicsweb/ebicsweb",
    hostId: "EBIXEBAT",
    ebicsVersion: "H005",
  },
  {
    preset: "sparkasse",
    bankName: "Sparkasse",
    hostUrl: "https://ebics.sparkasse.at/ebicsweb/ebicsweb",
    hostId: "EBIXSPAT",
    ebicsVersion: "H005",
  },
  {
    preset: "deutsche_bank",
    bankName: "Deutsche Bank",
    hostUrl: "https://ebics.deutsche-bank.de/ebicsweb/ebicsweb",
    hostId: "DEUTDEFF",
    ebicsVersion: "H005",
  },
  {
    preset: "manual",
    bankName: "",
    hostUrl: "",
    hostId: "",
    ebicsVersion: "H005",
  },
];
