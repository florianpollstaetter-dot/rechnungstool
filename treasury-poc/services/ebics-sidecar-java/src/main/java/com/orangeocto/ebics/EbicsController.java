package com.orangeocto.ebics;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.Map;

/**
 * Minimal REST surface for the PoC.
 *
 * Endpoints intentionally mirror the EBICS-3.0 BTF order types we plan to support
 * in production: INI/HIA bootstrap, HKD download, STA/C53 statement pull,
 * CCT/CCI payment upload, HEV version probe.
 *
 * PoC-Note: Bodies marshal directly to ebics-java-client; full mapping is the
 * job of W2 (issue-driven). The shell exists to prove the routing and so the
 * Next.js consumer in `src/lib/treasury/` can be written against a stable contract.
 */
@RestController
@RequestMapping("/ebics")
public class EbicsController {

    @Value("${ebics.hostId:OCTOPOC}")
    private String hostId;

    @Value("${ebics.partnerId:OCTO001}")
    private String partnerId;

    @Value("${ebics.userId:OCTOUSR1}")
    private String userId;

    @Value("${ebics.url:http://libeufin-sandbox:5016/ebicsweb}")
    private String bankUrl;

    @GetMapping("/health")
    public Map<String, Object> health() {
        return Map.of(
            "status", "ok",
            "candidate", "A-ebics-java-client",
            "hostId", hostId,
            "partnerId", partnerId
        );
    }

    /**
     * INI + HIA bootstrap: generates A005/X002/E002 keys and sends them to the bank.
     * Real implementation calls EbicsClient.sendINI() + sendHIA() from ebics-java-client.
     */
    @PostMapping("/init")
    public Map<String, Object> init() {
        // TODO(W2): wire ebics-java-client KeyManagement + sendINI/sendHIA.
        return Map.of("status", "stub", "next", "wire ebics-java-client INI/HIA in W2");
    }

    /**
     * HKD: download bank-known customer data (subscriber state, authorized order types).
     * Useful sanity check after INI/HIA before requesting real statements.
     */
    @GetMapping("/hkd")
    public Map<String, Object> hkd() {
        return Map.of("status", "stub", "next", "wire ebics-java-client HKD download in W2");
    }

    /**
     * STA / C53: download account statements for a given day range.
     * Returns raw CAMT.053 XML body; parsing lives in `src/lib/treasury/iso20022/`.
     */
    @GetMapping("/sta")
    public Map<String, Object> sta(
        @RequestParam("from") String from,
        @RequestParam(value = "to", required = false) String to
    ) {
        LocalDate fromDate = LocalDate.parse(from);
        LocalDate toDate = to != null ? LocalDate.parse(to) : fromDate;
        return Map.of(
            "status", "stub",
            "from", fromDate.toString(),
            "to", toDate.toString(),
            "next", "wire ebics-java-client FileTransfer STA/C53 in W2"
        );
    }

    /**
     * CCT / CCI: upload SEPA Credit Transfer initiation (pain.001).
     * Body is the raw pain.001 XML; sidecar wraps + signs it.
     */
    @PostMapping(value = "/cct", consumes = "application/xml")
    public Map<String, Object> cct(@RequestBody String pain001Xml) {
        int len = pain001Xml == null ? 0 : pain001Xml.length();
        return Map.of(
            "status", "stub",
            "payloadBytes", len,
            "next", "wire ebics-java-client FileTransfer CCT/CCI in W2"
        );
    }

    /**
     * HEV: probe supported EBICS versions on the bank side.
     * Cheap connectivity check.
     */
    @GetMapping("/hev")
    public Map<String, Object> hev() {
        return Map.of(
            "status", "stub",
            "bankUrl", bankUrl,
            "next", "wire ebics-java-client HEV in W2"
        );
    }
}
