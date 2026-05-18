"use client";

// ORA-2308 — INI / HIA initialization letter PDF.
//
// The wizard emits two letters per subscriber:
//   - INI: carries the **A006 signature key**'s public hash.
//   - HIA: carries the **E002 (encryption) + X002 (authentication)** public hashes.
//
// Production note: the hashes shown here are placeholders. The sidecar
// returns the actual fingerprints in the audit chain (`treasury_audit_chain`
// rows for `op=init`); once W3.4 (HSM-backed key store) is in, the wizard
// will fetch them from that table and pass them in via the `keys` prop.
// Until then we render the placeholder so the operator can already verify
// the letter template against the bank's expected layout.

import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";

Font.register({
  family: "Inter",
  fonts: [
    {
      src: "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf",
      fontWeight: 400,
    },
    {
      src: "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYMZg.ttf",
      fontWeight: 600,
    },
  ],
});

const styles = StyleSheet.create({
  page: {
    paddingTop: 50,
    paddingBottom: 60,
    paddingHorizontal: 56,
    fontFamily: "Inter",
    fontSize: 10,
    color: "#0A0A0A",
    lineHeight: 1.5,
  },
  header: { marginBottom: 24 },
  brand: { fontSize: 9, color: "#888", letterSpacing: 0.8, textTransform: "uppercase" },
  title: { fontSize: 18, fontWeight: 600, marginTop: 4, color: "#0A0A0A" },
  subtitle: { fontSize: 10, color: "#444", marginTop: 4 },
  bankBlock: { marginTop: 24, marginBottom: 24 },
  block: { marginTop: 16 },
  label: { fontSize: 8, color: "#666", textTransform: "uppercase", letterSpacing: 0.6 },
  value: { fontSize: 11, fontWeight: 600, color: "#0A0A0A", marginTop: 2 },
  table: { marginTop: 12, borderWidth: 0.5, borderColor: "#CCC" },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#E0E0E0",
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  tableLabel: { width: 140, fontSize: 9, color: "#444" },
  tableValue: { flex: 1, fontSize: 10, fontWeight: 600, color: "#0A0A0A" },
  hashBox: {
    marginTop: 16,
    padding: 12,
    backgroundColor: "#F7F7F7",
    borderLeftWidth: 3,
    borderLeftColor: "#C9A84C",
  },
  hashLabel: {
    fontSize: 8,
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  hash: { fontFamily: "Inter", fontSize: 11, fontWeight: 600, letterSpacing: 1.2 },
  signBlock: {
    marginTop: 36,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  signCell: { width: "45%" },
  signLine: { marginTop: 36, borderTopWidth: 0.5, borderTopColor: "#0A0A0A" },
  signLabel: { fontSize: 8, color: "#666", marginTop: 4 },
  footer: {
    position: "absolute",
    bottom: 32,
    left: 56,
    right: 56,
    fontSize: 8,
    color: "#888",
    textAlign: "center",
  },
});

export type LetterKind = "ini" | "hia";

export interface EbicsLetterKeyFingerprint {
  /** Display name of the key — e.g. "A006 Bankunterschrift". */
  keyName: string;
  /** Hex-formatted SHA-256 hash, grouped in spaces of 4 chars (left empty when unknown). */
  hashHex: string;
  /** Bit length (typically 2048). */
  bitLength: number;
}

export interface EbicsLetterPDFProps {
  kind: LetterKind;
  bankName: string;
  hostId: string;
  partnerId: string;
  userId: string;
  customerId: string;
  systemId?: string | null;
  ebicsVersion: string;
  /** Subscriber legal name printed at the bottom. */
  subscriberName: string;
  /** Date the letter was generated, as ISO-date. */
  generatedAt: string;
  /** Optional fingerprints — when omitted we render `—` placeholders. */
  fingerprints?: EbicsLetterKeyFingerprint[];
}

function formatHash(hex: string | undefined): string {
  if (!hex || hex.length === 0) return "— — — —  — — — —";
  return hex.toUpperCase().replace(/(.{4})/g, "$1 ").trim();
}

function defaultFingerprints(kind: LetterKind): EbicsLetterKeyFingerprint[] {
  if (kind === "ini") {
    return [{ keyName: "A006 (Bankunterschrift)", hashHex: "", bitLength: 2048 }];
  }
  return [
    { keyName: "E002 (Verschlüsselung)", hashHex: "", bitLength: 2048 },
    { keyName: "X002 (Authentifikation)", hashHex: "", bitLength: 2048 },
  ];
}

export default function EbicsLetterPDF(props: EbicsLetterPDFProps) {
  const title =
    props.kind === "ini" ? "EBICS-Initialisierungsbrief INI" : "EBICS-Initialisierungsbrief HIA";
  const subtitle =
    props.kind === "ini"
      ? "Übermittlung des Public-Keys der Bankunterschrift (A006)."
      : "Übermittlung der Public-Keys für Verschlüsselung (E002) und Authentifikation (X002).";
  const fingerprints = props.fingerprints?.length ? props.fingerprints : defaultFingerprints(props.kind);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.brand}>Treasury / Orange Octo</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>

        <View style={styles.bankBlock}>
          <Text style={styles.label}>An die Hausbank</Text>
          <Text style={styles.value}>{props.bankName}</Text>
        </View>

        <View style={styles.table}>
          <View style={styles.tableRow}>
            <Text style={styles.tableLabel}>EBICS-Version</Text>
            <Text style={styles.tableValue}>{props.ebicsVersion}</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableLabel}>Host-ID</Text>
            <Text style={styles.tableValue}>{props.hostId}</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableLabel}>Partner-ID</Text>
            <Text style={styles.tableValue}>{props.partnerId}</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableLabel}>User-ID</Text>
            <Text style={styles.tableValue}>{props.userId}</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableLabel}>Customer-ID</Text>
            <Text style={styles.tableValue}>{props.customerId}</Text>
          </View>
          {props.systemId ? (
            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>System-ID</Text>
              <Text style={styles.tableValue}>{props.systemId}</Text>
            </View>
          ) : null}
          <View style={styles.tableRow}>
            <Text style={styles.tableLabel}>Erstellt am</Text>
            <Text style={styles.tableValue}>{props.generatedAt}</Text>
          </View>
        </View>

        {fingerprints.map((fp) => (
          <View key={fp.keyName} style={styles.hashBox}>
            <Text style={styles.hashLabel}>
              {fp.keyName} · SHA-256 · {fp.bitLength} bit
            </Text>
            <Text style={styles.hash}>{formatHash(fp.hashHex)}</Text>
          </View>
        ))}

        <View style={styles.signBlock}>
          <View style={styles.signCell}>
            <View style={styles.signLine} />
            <Text style={styles.signLabel}>Ort, Datum</Text>
          </View>
          <View style={styles.signCell}>
            <View style={styles.signLine} />
            <Text style={styles.signLabel}>Unterschrift {props.subscriberName}</Text>
          </View>
        </View>

        <Text style={styles.footer}>
          Dieser Brief ist Teil der EBICS-Subscriber-Initialisierung. Bitte unterschrieben an Ihre Hausbank
          zurücksenden. Generiert von Orange Octo Treasury.
        </Text>
      </Page>
    </Document>
  );
}
