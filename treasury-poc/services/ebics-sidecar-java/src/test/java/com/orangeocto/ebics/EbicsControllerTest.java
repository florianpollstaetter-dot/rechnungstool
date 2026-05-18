package com.orangeocto.ebics;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Unit-test the REST surface with a deterministic stub facade. No real bank
 * traffic — that lives in the docker-compose smoke (CI workflow
 * treasury-poc-e2e).
 */
@WebMvcTest(EbicsController.class)
@TestPropertySource(properties = {
    "ebics.hostId=OCTOPOC",
    "ebics.partnerId=OCTO001"
})
class EbicsControllerTest {

    @TestConfiguration
    static class Stubs {
        @Bean
        @Primary
        EbicsClientFacade stub() {
            return new EbicsClientFacade() {
                @Override
                public InitResult init() { return new InitResult("req-init", "ORD1", "ORD2"); }
                @Override
                public HpbResult hpb() { return new HpbResult("req-hpb", new byte[] {1, 2, 3}); }
                @Override
                public HevResult hev() { return new HevResult("req-hev", "3.0", new byte[] {9}); }
                @Override
                public HkdResult hkd() { return new HkdResult("req-hkd", new byte[] {4, 5}); }
                @Override
                public StaResult sta(LocalDate from, LocalDate to) {
                    return new StaResult("req-sta", from, to, "CAMT053".getBytes());
                }
                @Override
                public CctResult cct(byte[] pain001) {
                    return new CctResult("req-cct", "BANKORDER1", pain001.length);
                }
            };
        }
    }

    @Autowired
    MockMvc mvc;

    @Test
    void health_reports_ok() throws Exception {
        mvc.perform(get("/ebics/health"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("ok"))
            .andExpect(jsonPath("$.hostId").value("OCTOPOC"));
    }

    @Test
    void init_returns_request_id_and_order_ids() throws Exception {
        mvc.perform(post("/ebics/init"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.requestId").value("req-init"))
            .andExpect(jsonPath("$.iniOrderId").value("ORD1"))
            .andExpect(jsonPath("$.hiaOrderId").value("ORD2"));
    }

    @Test
    void hev_returns_supported_version_and_raw_payload() throws Exception {
        mvc.perform(get("/ebics/hev"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.requestId").value("req-hev"))
            .andExpect(jsonPath("$.supportedVersion").value("3.0"))
            .andExpect(jsonPath("$.rawBase64").isNotEmpty())
            .andExpect(jsonPath("$.rawBytes").value(1));
    }

    @Test
    void hkd_returns_raw_payload() throws Exception {
        mvc.perform(get("/ebics/hkd"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.requestId").value("req-hkd"))
            .andExpect(jsonPath("$.rawBytes").value(2));
    }

    @Test
    void sta_returns_camt053_for_date_range() throws Exception {
        mvc.perform(get("/ebics/sta").param("from", "2026-05-01").param("to", "2026-05-02"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.requestId").value("req-sta"))
            .andExpect(jsonPath("$.from").value("2026-05-01"))
            .andExpect(jsonPath("$.to").value("2026-05-02"))
            .andExpect(jsonPath("$.rawBytes").value(7));
    }

    @Test
    void cct_rejects_empty_body() throws Exception {
        mvc.perform(post("/ebics/cct").contentType("application/xml").content(new byte[0]))
            .andExpect(status().isBadRequest());
    }

    @Test
    void cct_returns_bank_order_id() throws Exception {
        mvc.perform(post("/ebics/cct").contentType("application/xml").content("<x/>"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.requestId").value("req-cct"))
            .andExpect(jsonPath("$.bankOrderId").value("BANKORDER1"))
            .andExpect(jsonPath("$.payloadBytes").value(4));
    }
}
