package com.orangeocto.ebicsmock;

import java.math.BigInteger;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPublicKey;
import java.util.Base64;

import jakarta.annotation.PostConstruct;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Holds the bank's X002 (authentication) and E002 (encryption) RSA keypairs.
 * Generated at process startup and never persisted — in-memory only.
 *
 * The HPB response advertises these public keys to the subscriber, which then
 * uses them to verify bank signatures (X002) and encrypt order payloads (E002).
 */
@Component
public class BankKeyStore {

    private static final Logger LOG = LoggerFactory.getLogger(BankKeyStore.class);
    private static final int RSA_KEY_BITS = 2048;

    private KeyPair authKeyX002;
    private KeyPair encKeyE002;

    @PostConstruct
    void init() throws Exception {
        KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
        gen.initialize(RSA_KEY_BITS);
        this.authKeyX002 = gen.generateKeyPair();
        this.encKeyE002 = gen.generateKeyPair();
        LOG.info("Bank keys generated: X002 {} bits, E002 {} bits", RSA_KEY_BITS, RSA_KEY_BITS);
    }

    public RSAPublicKey authPublic() {
        return (RSAPublicKey) authKeyX002.getPublic();
    }

    public RSAPublicKey encPublic() {
        return (RSAPublicKey) encKeyE002.getPublic();
    }

    public static String base64(BigInteger value) {
        byte[] raw = value.toByteArray();
        // Drop the leading sign byte if present (BigInteger is signed).
        if (raw.length > 1 && raw[0] == 0) {
            byte[] trimmed = new byte[raw.length - 1];
            System.arraycopy(raw, 1, trimmed, 0, trimmed.length);
            raw = trimmed;
        }
        return Base64.getEncoder().encodeToString(raw);
    }
}
