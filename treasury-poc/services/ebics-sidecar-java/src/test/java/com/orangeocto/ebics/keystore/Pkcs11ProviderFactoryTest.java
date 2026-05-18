package com.orangeocto.ebics.keystore;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class Pkcs11ProviderFactoryTest {

    @Test
    void renderConfig_emits_expected_lines() {
        byte[] out = Pkcs11ProviderFactory.renderConfig(
                "cloudhsm",
                "/opt/cloudhsm/lib/libcloudhsm_pkcs11.so",
                2,
                "attributes(*,CKO_PRIVATE_KEY,*) = {\n  CKA_TOKEN = true\n}\n");
        String s = new String(out, StandardCharsets.UTF_8);
        assertTrue(s.contains("name = cloudhsm"), s);
        assertTrue(s.contains("library = /opt/cloudhsm/lib/libcloudhsm_pkcs11.so"), s);
        assertTrue(s.contains("slotListIndex = 2"), s);
        assertTrue(s.contains("CKA_TOKEN = true"), s);
        assertTrue(s.endsWith("\n"), "trailing newline required for parseable PKCS#11 cfg");
    }

    @Test
    void renderConfig_defaults_slot_index_to_zero() {
        byte[] out = Pkcs11ProviderFactory.renderConfig("smartcard", "/x/y.so", null, "");
        String s = new String(out, StandardCharsets.UTF_8);
        assertTrue(s.contains("slotListIndex = 0"));
    }

    @Test
    void requireLoadable_rejects_missing_library() {
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> Pkcs11ProviderFactory.requireLoadable("/nonexistent/no.so"));
        assertTrue(e.getMessage().contains("/nonexistent/no.so"), e.getMessage());
    }

    @Test
    void requireLoadable_rejects_blank() {
        assertEquals("PKCS#11 library path is required",
                assertThrows(IllegalArgumentException.class,
                        () -> Pkcs11ProviderFactory.requireLoadable(" ")).getMessage());
    }
}
