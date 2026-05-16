package com.orangeocto.ebics;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Keystore configuration for the PoC.
 *
 * PoC scope: file-based PKCS#12 keystore under `${EBICS_KEYSTORE_DIR}`.
 * Production (post-decision): swap this Bean for a PKCS#11 provider backed by AWS CloudHSM.
 *
 * The boundary is deliberately narrow — only this class touches the keystore path —
 * so the swap requires no controller/library churn.
 */
@Configuration
public class KeyStoreConfig {

    @Value("${ebics.keystore.dir:/var/lib/ebics-sidecar/keystore}")
    private String keystoreDir;

    @Value("${ebics.keystore.password:}")
    private String keystorePassword;

    @Bean
    public KeyStoreLocator keyStoreLocator() {
        return new KeyStoreLocator(Paths.get(keystoreDir), keystorePassword);
    }

    public record KeyStoreLocator(Path dir, String password) { }
}
