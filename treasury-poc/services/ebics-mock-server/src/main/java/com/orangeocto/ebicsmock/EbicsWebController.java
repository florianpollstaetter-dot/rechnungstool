package com.orangeocto.ebicsmock;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.security.interfaces.RSAPublicKey;
import java.util.Base64;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.Inflater;
import java.io.ByteArrayOutputStream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * EBICS-3.0 mock server — single dispatcher.
 *
 * Accepts the order types ORA-2297 smoke exercises (HEV, INI, HIA, HPB,
 * HKD, STA/C53, CCT, Receipt). Dispatches by sniffing the root element and
 * AdminOrderType/OrderType of the inbound XML. No signature verification.
 *
 * Protocol notes (ebics-java-client H005 v2.0.0):
 * - Key-management orders (INI, HIA, HPB) use AdminOrderType, not OrderType.
 * - All download responses (HPB, HKD, STA) must include <DataEncryptionInfo>
 *   with a RSA-wrapped AES session key so the client can decrypt OrderData.
 * - After each single-segment download the client sends a Receipt request
 *   (TransactionPhase=Receipt, no OrderType) that we must acknowledge.
 */
@RestController
@RequestMapping("/")
public class EbicsWebController {

    private static final Logger LOG = LoggerFactory.getLogger(EbicsWebController.class);

    private final BankKeyStore bankKeys;
    private final SubscriberRegistry subscribers;
    private final EbicsResponseBuilder responses;

    @Value("${ebicsmock.hostId}")
    private String hostId;

    public EbicsWebController(
            BankKeyStore bankKeys,
            SubscriberRegistry subscribers,
            EbicsResponseBuilder responses) {
        this.bankKeys = bankKeys;
        this.subscribers = subscribers;
        this.responses = responses;
    }

    @GetMapping("/")
    public ResponseEntity<String> root() {
        return ResponseEntity.ok("ebics-mock-server\n");
    }

    @GetMapping("/config")
    public ResponseEntity<String> config() {
        return ResponseEntity.ok("{\"hostId\":\"" + hostId + "\",\"ebicsVersion\":\"3.0\"}");
    }

    @PostMapping(value = "/ebicsweb", consumes = MediaType.ALL_VALUE)
    public ResponseEntity<String> ebicsweb(@RequestBody String body) {
        String rootElement = detectRootElement(body);
        LOG.info("ebicsweb in: root={} bytes={}", rootElement, body.length());

        String response = switch (rootElement) {
            case "ebicsHEVRequest"            -> responses.hev();
            case "ebicsUnsecuredRequest"      -> handleUnsecured(body);
            case "ebicsNoPubKeyDigestsRequest"-> handleNoPubKeyDigests(body);
            case "ebicsRequest"               -> handleAuthenticated(body);
            default -> responses.systemError("unknown-root-element:" + rootElement);
        };
        return ResponseEntity.ok()
                .contentType(MediaType.TEXT_XML)
                .body(response);
    }

    private String handleUnsecured(String body) {
        // ebics-java-client H005 uses AdminOrderType (not OrderType) for INI/HIA.
        String orderType = sniff("AdminOrderType", body);
        if (orderType == null) orderType = sniff("OrderType", body);
        LOG.info("unsecured order={}", orderType);

        if ("INI".equals(orderType)) {
            subscribers.recordKeyManagement(orderType);
            return responses.keyManagementAck(orderType);
        }
        if ("HIA".equals(orderType)) {
            extractAndStoreE002Key(body);
            subscribers.recordKeyManagement(orderType);
            return responses.keyManagementAck(orderType);
        }
        return responses.systemError("unsupported-unsecured-order:" + orderType);
    }

    private String handleNoPubKeyDigests(String body) {
        // HPB is sent as ebicsNoPubKeyDigestsRequest; uses AdminOrderType too.
        String orderType = sniff("AdminOrderType", body);
        if (orderType == null) orderType = sniff("OrderType", body);
        LOG.info("noPubKeyDigests order={}", orderType);
        if ("HPB".equals(orderType)) {
            RSAPublicKey subKey = subscribers.getSubscriberE002Key();
            return responses.hpb(bankKeys, subKey);
        }
        return responses.systemError("unsupported-no-pub-key-order:" + orderType);
    }

    private String handleAuthenticated(String body) {
        String orderType = sniff("OrderType", body);
        if (orderType == null) orderType = sniff("AdminOrderType", body);
        LOG.info("authenticated order={}", orderType);

        if (orderType == null) {
            // Receipt (download): TransactionPhase=Receipt
            if (body.contains("TransferReceipt") || body.contains("Receipt")) {
                return responses.receiptAck();
            }
            // Upload transfer segment: TransactionPhase=Transfer, no OrderType.
            // ebics-java-client sends one Transfer per segment after init.
            // Must return ebicsResponse (not ebicsKeyManagementResponse).
            if (body.contains("Transfer")) {
                return responses.transferAck();
            }
            return responses.systemError("unsupported-order:null");
        }

        RSAPublicKey subKey = subscribers.getSubscriberE002Key();
        return switch (orderType) {
            case "HKD"              -> responses.hkd(subKey);
            case "STA", "C53"       -> responses.statement(subKey);
            case "CCT", "CCTI", "CIP" -> responses.cctAck();
            case "BTU", "BTD"       -> responses.statement(subKey);
            default -> responses.systemError("unsupported-order:" + orderType);
        };
    }

    /**
     * Extracts the subscriber's E002 encryption public key from the HIA request.
     * The OrderData in the ebicsUnsecuredRequest is raw-deflate-compressed XML
     * (Utils.zip → Deflater, see ebics-java-client HIARequestElement).
     */
    private void extractAndStoreE002Key(String body) {
        try {
            String encodedOrderData = sniff("OrderData", body);
            if (encodedOrderData == null) {
                LOG.warn("HIA: no <OrderData> found, cannot extract E002 key");
                return;
            }
            byte[] compressed = Base64.getDecoder().decode(encodedOrderData.replaceAll("\\s+", ""));
            byte[] xml = inflate(compressed);
            String xmlStr = new String(xml, StandardCharsets.UTF_8);

            // Find <EncryptionPubKeyInfo> section to get the E002 cert specifically.
            Pattern encSection = Pattern.compile(
                    "<[^>]*:?EncryptionPubKeyInfo[^>]*>(.*?)</[^>]*:?EncryptionPubKeyInfo>",
                    Pattern.DOTALL);
            Matcher m = encSection.matcher(xmlStr);
            String section = m.find() ? m.group(1) : xmlStr;

            String certB64 = sniff("X509Certificate", section);
            if (certB64 == null) {
                LOG.warn("HIA: no <X509Certificate> in EncryptionPubKeyInfo");
                return;
            }
            byte[] certDer = Base64.getDecoder().decode(certB64.replaceAll("\\s+", ""));
            CertificateFactory cf = CertificateFactory.getInstance("X.509");
            X509Certificate cert = (X509Certificate) cf.generateCertificate(
                    new ByteArrayInputStream(certDer));
            subscribers.storeSubscriberE002Key((RSAPublicKey) cert.getPublicKey());
        } catch (Exception e) {
            LOG.warn("HIA: could not extract E002 key: {}", e.getMessage());
        }
    }

    private static byte[] inflate(byte[] compressed) throws Exception {
        Inflater inf = new Inflater();
        inf.setInput(compressed);
        ByteArrayOutputStream out = new ByteArrayOutputStream(compressed.length * 3);
        byte[] buf = new byte[4096];
        while (!inf.finished()) {
            int n = inf.inflate(buf);
            if (n == 0 && !inf.finished()) break;
            out.write(buf, 0, n);
        }
        inf.end();
        return out.toByteArray();
    }

    private static final Pattern ROOT_RE = Pattern.compile(
            "<\\s*(?:[A-Za-z0-9_]+:)?(ebics[A-Za-z]+)\\b", Pattern.DOTALL);

    static String detectRootElement(String body) {
        if (body == null) return "";
        Matcher m = ROOT_RE.matcher(body);
        return m.find() ? m.group(1) : "";
    }

    static String sniff(String tag, String body) {
        if (body == null) return null;
        Pattern p = Pattern.compile(
                "<\\s*(?:[A-Za-z0-9_]+:)?" + Pattern.quote(tag) + "\\b[^>]*>([^<]*)</",
                Pattern.DOTALL);
        Matcher m = p.matcher(body);
        return m.find() ? m.group(1).trim() : null;
    }
}
