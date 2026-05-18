package com.orangeocto.ebicsmock;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

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
 * EBICS-3.0 mock server.
 *
 * Accepts the seven order-types ORA-2297 smoke exercises (HEV, INI, HIA, HPB,
 * HKD, STA/C53, CCT). Dispatches by sniffing the root element + StaticHeader
 * OrderDetails of the inbound XML — no XSD validation, no signature
 * verification. Subscriber state is in-memory only.
 *
 * Endpoint path matches the legacy Libeufin contract: POST /ebicsweb (and a
 * couple of liveness / config affordances the compose healthcheck pings).
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
        EbicsResponseBuilder responses
    ) {
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
            case "ebicsHEVRequest" -> responses.hev();
            case "ebicsUnsecuredRequest" -> handleUnsecured(body);
            case "ebicsNoPubKeyDigestsRequest" -> handleNoPubKeyDigests(body);
            case "ebicsRequest" -> handleAuthenticated(body);
            default -> responses.systemError("unknown-root-element:" + rootElement);
        };
        return ResponseEntity.ok()
            .contentType(MediaType.TEXT_XML)
            .body(response);
    }

    private String handleUnsecured(String body) {
        // INI and HIA are sent as ebicsUnsecuredRequest with OrderType INI / HIA.
        String orderType = sniff("OrderType", body);
        LOG.info("unsecured order={}", orderType);
        if ("INI".equals(orderType) || "HIA".equals(orderType)) {
            subscribers.recordKeyManagement(orderType);
            return responses.keyManagementAck(orderType);
        }
        return responses.systemError("unsupported-unsecured-order:" + orderType);
    }

    private String handleNoPubKeyDigests(String body) {
        // HPB is sent as ebicsNoPubKeyDigestsRequest — subscriber doesn't yet
        // have the bank's keys, so the request omits the digest header.
        String orderType = sniff("OrderType", body);
        LOG.info("noPubKeyDigests order={}", orderType);
        if ("HPB".equals(orderType)) {
            return responses.hpb(bankKeys);
        }
        return responses.systemError("unsupported-no-pub-key-order:" + orderType);
    }

    private String handleAuthenticated(String body) {
        // All steady-state order types (HKD, HEV-via-authenticated, STA, C53,
        // CCT) share the ebicsRequest envelope.
        String orderType = sniff("OrderType", body);
        if (orderType == null) {
            // EBICS-3.0 sometimes uses AdminOrderType + ServiceName instead.
            orderType = sniff("AdminOrderType", body);
        }
        LOG.info("authenticated order={}", orderType);
        return switch (orderType == null ? "" : orderType) {
            case "HKD" -> responses.hkd();
            case "STA", "C53" -> responses.statement();
            case "CCT", "CCTI", "CIP" -> responses.cctAck();
            case "BTU", "BTD" -> responses.statement(); // EBICS-3 generic upload/download fall-back
            default -> responses.systemError("unsupported-order:" + orderType);
        };
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
