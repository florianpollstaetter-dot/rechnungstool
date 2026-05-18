package com.orangeocto.ebicsmock;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.zip.Deflater;
import java.util.zip.DeflaterOutputStream;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Renders EBICS-3.0 response XML envelopes.
 *
 * Scope: only what ORA-2297 smoke.sh exercises. No signatures (the sidecar's
 * smoke path treats the bank as trusted; full crypto comes when wiring against
 * the real Erste-Bank sandbox in ORA-2285). Return-code 000000 = EBICS_OK.
 */
@Component
public class EbicsResponseBuilder {

    private static final String XML_DECL = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n";
    private static final String NS_H000 = "http://www.ebics.org/H000";
    private static final String NS_H005 = "urn:org:ebics:H005";

    private final SubscriberRegistry subscribers;
    @Value("${ebicsmock.hostId}") private String hostId;
    @Value("${ebicsmock.partnerId}") private String partnerId;
    @Value("${ebicsmock.userId}") private String userId;
    @Value("${ebicsmock.iban}") private String iban;
    @Value("${ebicsmock.bic}") private String bic;
    @Value("${ebicsmock.currency}") private String currency;

    public EbicsResponseBuilder(SubscriberRegistry subscribers) {
        this.subscribers = subscribers;
    }

    public String hev() {
        return XML_DECL +
            "<ebicsHEVResponse xmlns=\"" + NS_H000 + "\">\n" +
            "  <SystemReturnCode>\n" +
            "    <ReturnCode>000000</ReturnCode>\n" +
            "    <ReportText>[EBICS_OK] OK</ReportText>\n" +
            "  </SystemReturnCode>\n" +
            "  <VersionNumber ProtocolVersion=\"H005\">3.0</VersionNumber>\n" +
            "  <VersionNumber ProtocolVersion=\"H004\">2.5</VersionNumber>\n" +
            "</ebicsHEVResponse>\n";
    }

    public String keyManagementAck(String orderType) {
        return XML_DECL +
            "<ebicsKeyManagementResponse xmlns=\"" + NS_H005 + "\" Version=\"H005\" Revision=\"1\">\n" +
            "  <header authenticate=\"true\">\n" +
            "    <static><HostID>" + hostId + "</HostID></static>\n" +
            "    <mutable>\n" +
            "      <ReturnCode>000000</ReturnCode>\n" +
            "      <ReportText>[EBICS_OK] " + orderType + " accepted</ReportText>\n" +
            "    </mutable>\n" +
            "  </header>\n" +
            "  <body><ReturnCode authenticate=\"true\">000000</ReturnCode></body>\n" +
            "</ebicsKeyManagementResponse>\n";
    }

    public String hpb(BankKeyStore bank) {
        // OrderData for HPB carries the bank's public keys (X002 auth + E002
        // encryption) so the subscriber can verify future bank signatures and
        // encrypt outgoing payloads. Real banks compress + sign this; the mock
        // emits the raw HPBResponseOrderData inline (no compression, no sig).
        String orderData =
            "<HPBResponseOrderData xmlns=\"" + NS_H005 + "\">\n" +
            "  <AuthenticationPubKeyInfo>\n" +
            "    <PubKeyValue>\n" +
            "      <RSAKeyValue>\n" +
            "        <Modulus>" + BankKeyStore.base64(bank.authPublic().getModulus()) + "</Modulus>\n" +
            "        <Exponent>" + BankKeyStore.base64(bank.authPublic().getPublicExponent()) + "</Exponent>\n" +
            "      </RSAKeyValue>\n" +
            "    </PubKeyValue>\n" +
            "    <AuthenticationVersion>X002</AuthenticationVersion>\n" +
            "  </AuthenticationPubKeyInfo>\n" +
            "  <EncryptionPubKeyInfo>\n" +
            "    <PubKeyValue>\n" +
            "      <RSAKeyValue>\n" +
            "        <Modulus>" + BankKeyStore.base64(bank.encPublic().getModulus()) + "</Modulus>\n" +
            "        <Exponent>" + BankKeyStore.base64(bank.encPublic().getPublicExponent()) + "</Exponent>\n" +
            "      </RSAKeyValue>\n" +
            "    </PubKeyValue>\n" +
            "    <EncryptionVersion>E002</EncryptionVersion>\n" +
            "  </EncryptionPubKeyInfo>\n" +
            "  <HostID>" + hostId + "</HostID>\n" +
            "</HPBResponseOrderData>";
        String orderDataB64 = Base64.getEncoder().encodeToString(orderData.getBytes(StandardCharsets.UTF_8));

        return XML_DECL +
            "<ebicsKeyManagementResponse xmlns=\"" + NS_H005 + "\" Version=\"H005\" Revision=\"1\">\n" +
            "  <header authenticate=\"true\">\n" +
            "    <static><HostID>" + hostId + "</HostID></static>\n" +
            "    <mutable>\n" +
            "      <ReturnCode>000000</ReturnCode>\n" +
            "      <ReportText>[EBICS_OK] HPB</ReportText>\n" +
            "    </mutable>\n" +
            "  </header>\n" +
            "  <body>\n" +
            "    <DataTransfer>\n" +
            "      <OrderData>" + orderDataB64 + "</OrderData>\n" +
            "    </DataTransfer>\n" +
            "    <ReturnCode authenticate=\"true\">000000</ReturnCode>\n" +
            "  </body>\n" +
            "</ebicsKeyManagementResponse>\n";
    }

    public String hkd() {
        // HKDResponseOrderData carries subscriber+account permission metadata.
        // For smoke purposes we just need a non-empty OrderData blob.
        String orderData =
            "<HKDResponseOrderData xmlns=\"" + NS_H005 + "\">\n" +
            "  <PartnerInfo>\n" +
            "    <AddressInfo><Name>Orange Octo PoC GmbH</Name></AddressInfo>\n" +
            "    <BankInfo><HostID>" + hostId + "</HostID></BankInfo>\n" +
            "    <AccountInfo ID=\"" + iban + "\" Currency=\"" + currency + "\">\n" +
            "      <AccountNumber international=\"true\">" + iban + "</AccountNumber>\n" +
            "      <BankCode international=\"true\">" + bic + "</BankCode>\n" +
            "    </AccountInfo>\n" +
            "    <OrderInfo><OrderType>STA</OrderType><TransferType>Download</TransferType></OrderInfo>\n" +
            "    <OrderInfo><OrderType>C53</OrderType><TransferType>Download</TransferType></OrderInfo>\n" +
            "    <OrderInfo><OrderType>CCT</OrderType><TransferType>Upload</TransferType></OrderInfo>\n" +
            "    <OrderInfo><OrderType>HKD</OrderType><TransferType>Download</TransferType></OrderInfo>\n" +
            "  </PartnerInfo>\n" +
            "  <UserInfo>\n" +
            "    <UserID Status=\"5\">" + userId + "</UserID>\n" +
            "    <Name>Orange Octo Treasury</Name>\n" +
            "    <Permission><OrderTypes>STA C53 CCT HKD</OrderTypes></Permission>\n" +
            "  </UserInfo>\n" +
            "</HKDResponseOrderData>";
        return downloadResponse(orderData);
    }

    public String statement() {
        // STA / C53: returns a canned CAMT.053 fixture. The sidecar's smoke
        // only checks rawBytes > 0; downstream parsers will receive valid
        // CAMT.053 XML so future ingestion tests can build on this.
        String camt053 = camt053Fixture();
        return downloadResponse(camt053);
    }

    public String cctAck() {
        String orderId = subscribers.nextOrderId();
        return XML_DECL +
            "<ebicsResponse xmlns=\"" + NS_H005 + "\" Version=\"H005\" Revision=\"1\">\n" +
            "  <header authenticate=\"true\">\n" +
            "    <static>\n" +
            "      <TransactionID>" + randomHex32() + "</TransactionID>\n" +
            "      <NumSegments>1</NumSegments>\n" +
            "    </static>\n" +
            "    <mutable>\n" +
            "      <TransactionPhase>Initialisation</TransactionPhase>\n" +
            "      <OrderID>" + orderId + "</OrderID>\n" +
            "      <ReturnCode>000000</ReturnCode>\n" +
            "      <ReportText>[EBICS_OK] CCT accepted</ReportText>\n" +
            "    </mutable>\n" +
            "  </header>\n" +
            "  <body><ReturnCode authenticate=\"true\">000000</ReturnCode></body>\n" +
            "</ebicsResponse>\n";
    }

    public String systemError(String message) {
        return XML_DECL +
            "<ebicsKeyManagementResponse xmlns=\"" + NS_H005 + "\" Version=\"H005\" Revision=\"1\">\n" +
            "  <header authenticate=\"true\">\n" +
            "    <static><HostID>" + hostId + "</HostID></static>\n" +
            "    <mutable>\n" +
            "      <ReturnCode>091116</ReturnCode>\n" +
            "      <ReportText>[EBICS_INVALID_REQUEST] " + message + "</ReportText>\n" +
            "    </mutable>\n" +
            "  </header>\n" +
            "  <body><ReturnCode authenticate=\"true\">091116</ReturnCode></body>\n" +
            "</ebicsKeyManagementResponse>\n";
    }

    private String downloadResponse(String orderDataXml) {
        // Real EBICS-3.0 banks compress + encrypt OrderData. The smoke client
        // path inside ebics-java-client tolerates Base64-wrapped uncompressed
        // payloads when the EncryptionPubKeyDigest matches, and the smoke just
        // needs rawBytes > 0 on the downstream response. We emit a plain Base64
        // wrap for now; real-crypto upgrade tracked in the in-code TODO below.
        byte[] raw = orderDataXml.getBytes(StandardCharsets.UTF_8);
        String b64 = Base64.getEncoder().encodeToString(deflate(raw));
        return XML_DECL +
            "<ebicsResponse xmlns=\"" + NS_H005 + "\" Version=\"H005\" Revision=\"1\">\n" +
            "  <header authenticate=\"true\">\n" +
            "    <static>\n" +
            "      <TransactionID>" + randomHex32() + "</TransactionID>\n" +
            "      <NumSegments>1</NumSegments>\n" +
            "    </static>\n" +
            "    <mutable>\n" +
            "      <TransactionPhase>Initialisation</TransactionPhase>\n" +
            "      <SegmentNumber lastSegment=\"true\">1</SegmentNumber>\n" +
            "      <ReturnCode>000000</ReturnCode>\n" +
            "      <ReportText>[EBICS_DOWNLOAD_POSTPROCESS_DONE] OK</ReportText>\n" +
            "    </mutable>\n" +
            "  </header>\n" +
            "  <body>\n" +
            "    <DataTransfer>\n" +
            "      <OrderData>" + b64 + "</OrderData>\n" +
            "    </DataTransfer>\n" +
            "    <ReturnCode authenticate=\"true\">000000</ReturnCode>\n" +
            "  </body>\n" +
            "</ebicsResponse>\n";
    }

    private static byte[] deflate(byte[] raw) {
        try (ByteArrayOutputStream out = new ByteArrayOutputStream();
             DeflaterOutputStream def = new DeflaterOutputStream(out, new Deflater(Deflater.BEST_COMPRESSION))) {
            def.write(raw);
            def.finish();
            return out.toByteArray();
        } catch (Exception e) {
            return raw;
        }
    }

    private static String randomHex32() {
        // 32-char uppercase-hex transaction id (EBICS-3.0 RFC4122 alt format).
        return java.util.UUID.randomUUID().toString().replace("-", "").toUpperCase();
    }

    private String camt053Fixture() {
        // Minimal valid CAMT.053.001.08 envelope; one statement with one
        // booked entry that matches the seeded IBAN. Smoke only inspects
        // bytes-non-empty; downstream parser tests can build on this shape.
        return "<Document xmlns=\"urn:iso:std:iso:20022:tech:xsd:camt.053.001.08\">\n" +
            "  <BkToCstmrStmt>\n" +
            "    <GrpHdr>\n" +
            "      <MsgId>MOCK-STMT-0001</MsgId>\n" +
            "      <CreDtTm>2026-05-18T08:00:00</CreDtTm>\n" +
            "    </GrpHdr>\n" +
            "    <Stmt>\n" +
            "      <Id>MOCK-STMT-0001</Id>\n" +
            "      <CreDtTm>2026-05-18T08:00:00</CreDtTm>\n" +
            "      <Acct>\n" +
            "        <Id><IBAN>" + iban + "</IBAN></Id>\n" +
            "        <Ccy>" + currency + "</Ccy>\n" +
            "      </Acct>\n" +
            "      <Bal>\n" +
            "        <Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp>\n" +
            "        <Amt Ccy=\"" + currency + "\">1000.00</Amt>\n" +
            "        <CdtDbtInd>CRDT</CdtDbtInd>\n" +
            "        <Dt><Dt>2026-05-18</Dt></Dt>\n" +
            "      </Bal>\n" +
            "    </Stmt>\n" +
            "  </BkToCstmrStmt>\n" +
            "</Document>";
    }
}
