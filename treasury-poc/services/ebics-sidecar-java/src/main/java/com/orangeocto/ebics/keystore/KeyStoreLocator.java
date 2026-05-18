package com.orangeocto.ebics.keystore;

import java.nio.file.Path;
import java.security.KeyStore;
import java.security.Provider;

/**
 * Pluggable keystore seam introduced by ORA-2297 and extended by ORA-2309 (HSM).
 *
 * The {@code dir} and {@code password} accessors are retained for file-based
 * paths still required by the upstream {@code ebics-java-client} 2.0.0 (trace
 * logs, ebics.properties). For HSM-backed backends, {@code dir} points to a
 * working directory used only for non-secret artifacts, never for private keys.
 *
 * Private-key material for the {@code aws-cloudhsm} and {@code smartcard}
 * backends lives exclusively inside the PKCS#11 token; sign operations are
 * executed inside the device via {@link #keyStore()} + JCE.
 */
public sealed interface KeyStoreLocator permits
        FileKeyStoreLocator,
        AwsCloudHsmKeyStoreLocator,
        SmartcardKeyStoreLocator {

    enum Backend { FILE, AWS_CLOUDHSM, SMARTCARD }

    Backend backend();

    /**
     * Working directory for non-secret artifacts (trace logs, ebics.properties,
     * subscriber metadata). Always set; for HSM backends this is a tmpfs path.
     */
    Path dir();

    /**
     * Keystore password for file backend, or PKCS#11 user PIN for HSM backends.
     */
    String password();

    /**
     * JCE provider, or {@code null} for the file backend.
     * HSM backends register a {@link sun.security.pkcs11.SunPKCS11}-equivalent
     * provider; this method returns it for direct access if needed.
     */
    Provider provider();

    /**
     * Opened JCE {@link KeyStore} backed by the configured PKCS#11 token, or
     * {@code null} for the file backend (the upstream ebics-java-client owns
     * its own PKCS#12 file in that case).
     */
    KeyStore keyStore();
}
