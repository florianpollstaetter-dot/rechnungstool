package com.orangeocto.ebicsmock;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.security.interfaces.RSAPublicKey;
import java.util.Base64;
import java.util.zip.Deflater;
import java.util.zip.DeflaterOutputStream;

import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Renders EBICS-3.0 response XML envelopes.
 *
 * Scope: only what ORA-2297 smoke.sh exercises. Crypto follows the
 * ebics-java-client v2.0.0 expectations:
 *
 *   - Download payload: AES/CBC/ISO10126Padding, 16-byte zero IV, 16-byte key.
 *   - Transaction key: RSA/NONE/PKCS1Padding with subscriber's E002 public key.
 *   - HPBResponseOrderData: DER-encoded self-signed X.509 certs for bank keys.
 *   - Receipt: plain 000000 ebicsResponse.
 *
 * If the subscriber E002 key is null (HPB requested before HIA), the response
 * falls back to unencrypted Base64 — this should not happen in correct smoke flow.
 */
@Component
public class EbicsResponseBuilder {

    private static final Logger LOG = LoggerFactory.getLogger(EbicsResponseBuilder.class);

    private static final String XML_DECL = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n";
    private static final String NS_H000  = "http://www.ebics.org/H000";
    private static final String NS_H005  = "urn:org:ebics:H005";
    private static final SecureRandom RNG = new SecureRandom();

    private final SubscriberRegistry subscribers;

    @Value("${ebicsmock.hostId}")   private String hostId;
    @Value("${ebicsmock.partnerId}") private String partnerId;
    @Value("${ebicsmock.userId}")   private String userId;
    @Value("${ebicsmock.iban}")     private String iban;
    @Value("${ebicsmock.bic}")      private String bic;
    @Value("${ebicsmock.currency}") private String currency;

    public EbicsResponseBuilder(SubscriberRegistry subscribers) {
        this.subscribers = subscribers;
    }

    // ------------------------------------------------------------------ HEV

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

    // ------------------------------------------------------------------ INI / HIA

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

    // ------------------------------------------------------------------ HPB

    /**
     * Returns the HPB response containing the bank's public keys (X002 auth +
     * E002 encryption) as DER-encoded X.509 certs, encrypted with an AES session
     * key that is RSA-PKCS1-wrapped with the subscriber's E002 public key.
     */
    public String hpb(BankKeyStore bank, RSAPublicKey subscriberE002Key) {
        String orderData = buildHpbOrderData(bank);
        return encryptedKeyManagementResponse("HPB", orderData, subscriberE002Key);
    }

    private static final String NS_DS = "http://www.w3.org/2000/09/xmldsig#";

    private String buildHpbOrderData(BankKeyStore bank) {
        String authCertB64 = Base64.getEncoder().encodeToString(bank.authCertDer());
        String encCertB64  = Base64.getEncoder().encodeToString(bank.encCertDer());
        // X509Data MUST be in the xmldsig namespace (ds:) — ebics_types_H005 xsd:
        //   <element ref="ds:X509Data"/> inside PubKeyInfoType.
        // Without the ds: prefix the XMLBeans parser can't find it → getX509Data() == null.
        return "<HPBResponseOrderData xmlns=\"" + NS_H005 + "\" xmlns:ds=\"" + NS_DS + "\">\n" +
            "  <AuthenticationPubKeyInfo>\n" +
            "    <ds:X509Data><ds:X509Certificate>" + authCertB64 + "</ds:X509Certificate></ds:X509Data>\n" +
            "    <AuthenticationVersion>X002</AuthenticationVersion>\n" +
            "  </AuthenticationPubKeyInfo>\n" +
            "  <EncryptionPubKeyInfo>\n" +
            "    <ds:X509Data><ds:X509Certificate>" + encCertB64 + "</ds:X509Certificate></ds:X509Data>\n" +
            "    <EncryptionVersion>E002</EncryptionVersion>\n" +
            "  </EncryptionPubKeyInfo>\n" +
            "  <HostID>" + hostId + "</HostID>\n" +
            "</HPBResponseOrderData>";
    }

    // ------------------------------------------------------------------ HKD

    public String hkd(RSAPublicKey subscriberE002Key) {
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
        return encryptedDownloadResponse(orderData, subscriberE002Key);
    }

    // ------------------------------------------------------------------ STA / C53

    public String statement(RSAPublicKey subscriberE002Key) {
        return encryptedDownloadResponse(camt053Fixture(), subscriberE002Key);
    }

    // ------------------------------------------------------------------ CCT

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

    // ------------------------------------------------------------------ Receipt

    public String receiptAck() {
        return XML_DECL +
            "<ebicsResponse xmlns=\"" + NS_H005 + "\" Version=\"H005\" Revision=\"1\">\n" +
            "  <header authenticate=\"true\">\n" +
            "    <static><TransactionID>" + randomHex32() + "</TransactionID></static>\n" +
            "    <mutable>\n" +
            "      <TransactionPhase>Receipt</TransactionPhase>\n" +
            "      <ReturnCode>000000</ReturnCode>\n" +
            "      <ReportText>[EBICS_OK] Receipt</ReportText>\n" +
            "    </mutable>\n" +
            "  </header>\n" +
            "  <body><ReturnCode authenticate=\"true\">000000</ReturnCode></body>\n" +
            "</ebicsResponse>\n";
    }

    // ------------------------------------------------------------------ Error

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

    // ------------------------------------------------------------------ Crypto helpers

    /**
     * Wraps orderDataXml in an encrypted ebicsKeyManagementResponse (used for HPB).
     */
    private String encryptedKeyManagementResponse(String label, String orderDataXml,
                                                   RSAPublicKey subscriberE002Key) {
        try {
            EncryptedPayload ep = encrypt(orderDataXml, subscriberE002Key);
            return XML_DECL +
                "<ebicsKeyManagementResponse xmlns=\"" + NS_H005 + "\" Version=\"H005\" Revision=\"1\">\n" +
                "  <header authenticate=\"true\">\n" +
                "    <static><HostID>" + hostId + "</HostID></static>\n" +
                "    <mutable>\n" +
                "      <ReturnCode>000000</ReturnCode>\n" +
                "      <ReportText>[EBICS_OK] " + label + "</ReportText>\n" +
                "    </mutable>\n" +
                "  </header>\n" +
                "  <body>\n" +
                "    <DataTransfer>\n" +
                ep.dataEncryptionInfo() +
                "      <OrderData>" + ep.orderDataB64() + "</OrderData>\n" +
                "    </DataTransfer>\n" +
                "    <ReturnCode authenticate=\"true\">000000</ReturnCode>\n" +
                "  </body>\n" +
                "</ebicsKeyManagementResponse>\n";
        } catch (Exception e) {
            LOG.error("HPB encryption failed", e);
            return systemError("hpb-encryption-error: " + e.getMessage());
        }
    }

    /**
     * Wraps orderDataXml in an encrypted ebicsResponse (used for HKD, STA, C53).
     */
    private String encryptedDownloadResponse(String orderDataXml, RSAPublicKey subscriberE002Key) {
        try {
            EncryptedPayload ep = encrypt(orderDataXml, subscriberE002Key);
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
                ep.dataEncryptionInfo() +
                "      <OrderData>" + ep.orderDataB64() + "</OrderData>\n" +
                "    </DataTransfer>\n" +
                "    <ReturnCode authenticate=\"true\">000000</ReturnCode>\n" +
                "  </body>\n" +
                "</ebicsResponse>\n";
        } catch (Exception e) {
            LOG.error("Download encryption failed", e);
            return systemError("download-encryption-error: " + e.getMessage());
        }
    }

    private record EncryptedPayload(String dataEncryptionInfo, String orderDataB64) {}

    /**
     * Encrypts orderDataXml with a fresh 16-byte AES key (AES/CBC/ISO10126Padding,
     * 16-byte zero IV), wraps the AES key with the subscriber's E002 RSA key
     * (RSA/NONE/PKCS1Padding), and returns the DataEncryptionInfo XML block
     * plus the Base64-encoded encrypted data.
     */
    private EncryptedPayload encrypt(String orderDataXml, RSAPublicKey subscriberE002Key)
            throws Exception {
        byte[] raw = deflate(orderDataXml.getBytes(StandardCharsets.UTF_8));

        // 16-byte AES session key
        byte[] aesKey = new byte[16];
        RNG.nextBytes(aesKey);

        // AES/CBC/ISO10126Padding with zero IV (matches ebics-java-client Utils.decrypt)
        Cipher aesCipher = Cipher.getInstance("AES/CBC/ISO10126Padding",
                BouncyCastleProvider.PROVIDER_NAME);
        aesCipher.init(Cipher.ENCRYPT_MODE,
                new SecretKeySpec(aesKey, "AES"),
                new IvParameterSpec(new byte[16]));
        byte[] encData = aesCipher.doFinal(raw);

        String orderDataB64 = Base64.getEncoder().encodeToString(encData);

        // RSA-PKCS1 wrap the AES key with subscriber's E002 public key
        String encKeyB64;
        String keyDigest;
        if (subscriberE002Key != null) {
            Cipher rsaCipher = Cipher.getInstance("RSA/NONE/PKCS1Padding",
                    BouncyCastleProvider.PROVIDER_NAME);
            rsaCipher.init(Cipher.ENCRYPT_MODE, subscriberE002Key);
            encKeyB64 = Base64.getEncoder().encodeToString(rsaCipher.doFinal(aesKey));
            keyDigest = ebicsKeyDigest(subscriberE002Key);
        } else {
            // Fallback: encode the raw AES key (subscriber hasn't sent HIA yet).
            // This should not happen in correct smoke flow; log a warning.
            LOG.warn("Subscriber E002 key not yet available — sending unencrypted transaction key");
            encKeyB64 = Base64.getEncoder().encodeToString(aesKey);
            keyDigest = "";
        }

        String dataEncryptionInfo =
            "      <DataEncryptionInfo authenticate=\"true\">\n" +
            "        <EncryptionPubKeyDigest Algorithm=\"http://www.w3.org/2001/04/xmlenc#sha256\"" +
            " Version=\"E002\">" + keyDigest + "</EncryptionPubKeyDigest>\n" +
            "        <TransactionKey>" + encKeyB64 + "</TransactionKey>\n" +
            "      </DataEncryptionInfo>\n";

        return new EncryptedPayload(dataEncryptionInfo, orderDataB64);
    }

    /**
     * Computes the EBICS key digest as expected by ebics-java-client's KeyUtil.getKeyDigest:
     *   SHA-256( hex(exponent) + " " + hex(modulus_without_leading_zero) )
     * The result is returned as a lowercase hex string encoded in Base64.
     */
    private static String ebicsKeyDigest(RSAPublicKey key) throws Exception {
        String exponent = bytesToHex(key.getPublicExponent().toByteArray());
        byte[] modBytes = key.getModulus().toByteArray();
        // Remove leading zero byte if present (BigInteger is signed)
        if (modBytes.length > 1 && modBytes[0] == 0) {
            byte[] tmp = new byte[modBytes.length - 1];
            System.arraycopy(modBytes, 1, tmp, 0, tmp.length);
            modBytes = tmp;
        }
        String modulus = bytesToHex(modBytes);
        String hash = exponent + " " + modulus;
        if (hash.charAt(0) == '0') hash = hash.substring(1);
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(
                hash.getBytes(StandardCharsets.US_ASCII));
        // Return hex of digest (matches KeyUtil.getKeyDigest return format), then Base64 it
        String hexDigest = bytesToHex(digest);
        return Base64.getEncoder().encodeToString(hexDigest.getBytes(StandardCharsets.US_ASCII));
    }

    private static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) sb.append(String.format("%02x", b & 0xff));
        return sb.toString();
    }

    private static byte[] deflate(byte[] raw) {
        try (ByteArrayOutputStream out = new ByteArrayOutputStream();
             DeflaterOutputStream def = new DeflaterOutputStream(out,
                     new Deflater(Deflater.BEST_COMPRESSION))) {
            def.write(raw);
            def.finish();
            return out.toByteArray();
        } catch (Exception e) {
            return raw;
        }
    }

    private static String randomHex32() {
        return java.util.UUID.randomUUID().toString().replace("-", "").toUpperCase();
    }

    private String camt053Fixture() {
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
