package com.orangeocto.ebics;

import java.time.LocalDate;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * REST surface for the EBICS sidecar.
 *
 * Contract with the Next.js consumer (audit-chain side):
 *  - every successful response carries {@code requestId} (sidecar-issued UUID)
 *    and the raw bank payload as base64 in {@code rawBase64}.
 *  - Next.js hashes {@code rawBase64 || requestId} into the
 *    {@code treasury_audit_chain} table. The sidecar never writes the chain.
 *
 * Errors propagate as HTTP 502 with a JSON body so the Next.js side can record
 * a failed chain entry without parsing free-form stack traces.
 */
@RestController
@RequestMapping("/ebics")
public class EbicsController {

    private static final Logger LOG = LoggerFactory.getLogger(EbicsController.class);

    private final EbicsClientFacade ebics;

    @Value("${ebics.hostId}")
    private String hostId;

    @Value("${ebics.partnerId}")
    private String partnerId;

    public EbicsController(EbicsClientFacade ebics) {
        this.ebics = ebics;
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        return Map.of(
            "status", "ok",
            "candidate", "A-ebics-java-client",
            "hostId", hostId,
            "partnerId", partnerId
        );
    }

    @PostMapping("/init")
    public ResponseEntity<Map<String, Object>> init() {
        try {
            EbicsClientFacade.InitResult r = ebics.init();
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("requestId", r.requestId());
            body.put("iniOrderId", r.iniOrderId());
            body.put("hiaOrderId", r.hiaOrderId());
            return ResponseEntity.ok(body);
        } catch (Exception e) {
            return failed("init", e);
        }
    }

    @GetMapping("/hpb")
    public ResponseEntity<Map<String, Object>> hpb() {
        try {
            EbicsClientFacade.HpbResult r = ebics.hpb();
            return ResponseEntity.ok(rawBody(r.requestId(), r.rawResponse()));
        } catch (Exception e) {
            return failed("hpb", e);
        }
    }

    @GetMapping("/hev")
    public ResponseEntity<Map<String, Object>> hev() {
        try {
            EbicsClientFacade.HevResult r = ebics.hev();
            Map<String, Object> body = rawBody(r.requestId(), r.rawResponse());
            body.put("supportedVersion", r.supportedVersion());
            return ResponseEntity.ok(body);
        } catch (Exception e) {
            return failed("hev", e);
        }
    }

    @GetMapping("/hkd")
    public ResponseEntity<Map<String, Object>> hkd() {
        try {
            EbicsClientFacade.HkdResult r = ebics.hkd();
            return ResponseEntity.ok(rawBody(r.requestId(), r.rawResponse()));
        } catch (Exception e) {
            return failed("hkd", e);
        }
    }

    @GetMapping("/sta")
    public ResponseEntity<Map<String, Object>> sta(
        @RequestParam("from") String fromIso,
        @RequestParam(value = "to", required = false) String toIso
    ) {
        try {
            LocalDate from = LocalDate.parse(fromIso);
            LocalDate to = toIso != null ? LocalDate.parse(toIso) : from;
            EbicsClientFacade.StaResult r = ebics.sta(from, to);
            Map<String, Object> body = rawBody(r.requestId(), r.camt053());
            body.put("from", r.from().toString());
            body.put("to", r.to().toString());
            return ResponseEntity.ok(body);
        } catch (Exception e) {
            return failed("sta", e);
        }
    }

    @PostMapping(value = "/cct", consumes = MediaType.APPLICATION_XML_VALUE)
    public ResponseEntity<Map<String, Object>> cct(@RequestBody byte[] pain001) {
        try {
            if (pain001 == null || pain001.length == 0) {
                return ResponseEntity.badRequest().body(Map.of(
                    "error", "empty-payload",
                    "message", "pain.001 body is empty"
                ));
            }
            EbicsClientFacade.CctResult r = ebics.cct(pain001);
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("requestId", r.requestId());
            body.put("bankOrderId", r.bankOrderId());
            body.put("payloadBytes", r.payloadBytes());
            return ResponseEntity.ok(body);
        } catch (Exception e) {
            return failed("cct", e);
        }
    }

    private Map<String, Object> rawBody(String requestId, byte[] raw) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("requestId", requestId);
        body.put("rawBase64", Base64.getEncoder().encodeToString(raw == null ? new byte[0] : raw));
        body.put("rawBytes", raw == null ? 0 : raw.length);
        return body;
    }

    private ResponseEntity<Map<String, Object>> failed(String op, Exception e) {
        LOG.error("ebics.{} failed: {}", op, e.toString(), e);
        return ResponseEntity.status(502).body(Map.of(
            "error", "ebics-failure",
            "op", op,
            "message", e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()
        ));
    }
}
