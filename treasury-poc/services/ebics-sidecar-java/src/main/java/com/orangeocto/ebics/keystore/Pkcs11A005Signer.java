package com.orangeocto.ebics.keystore;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.Signature;
import java.security.cert.Certificate;
import java.util.Enumeration;
import java.util.Optional;

/**
 * On-HSM A005 signer.
 *
 * <p>EBICS A005 ("authentication signature") is an RSASSA-PKCS1-v1_5 signature
 * over a SHA-256 digest of the canonicalised request. With an HSM-backed key
 * we must never read the private-key bytes out of the device — the signature
 * is computed inside the PKCS#11 token via {@code C_Sign}.
 *
 * <p>This component is the canonical signing call site that the upstream
 * ebics-java-client integration (separate follow-up to ORA-2309) will route
 * its A005 signing through. The standalone {@link #sign(byte[])} entry point
 * lets the integration test suite verify SoftHSMv2 round-tripping without
 * pulling in the full INI/HIA flow.
 *
 * <p>No-op when {@link KeyStoreLocator#backend()} is {@code FILE}: returns
 * {@link Optional#empty()} so the upstream library keeps full ownership.
 */
@Component
public class Pkcs11A005Signer {

    private static final Logger LOG = LoggerFactory.getLogger(Pkcs11A005Signer.class);

    private final KeyStoreLocator locator;

    @Autowired
    public Pkcs11A005Signer(KeyStoreLocator locator) {
        this.locator = locator;
    }

    /**
     * @return {@link Optional#empty()} for the file backend, else the signed bytes.
     */
    public Optional<byte[]> sign(byte[] toBeSigned) throws Exception {
        if (locator.backend() == KeyStoreLocator.Backend.FILE) return Optional.empty();
        if (toBeSigned == null || toBeSigned.length == 0) {
            throw new IllegalArgumentException("toBeSigned must be non-empty");
        }
        String alias = aliasFor(locator);
        KeyStore ks = locator.keyStore();
        if (!ks.isKeyEntry(alias)) {
            throw new IllegalStateException(
                    "A005 key alias not found in PKCS#11 token: " + alias
                            + " (backend=" + locator.backend() + "). Available: " + listAliases(ks));
        }
        PrivateKey pk = (PrivateKey) ks.getKey(alias, null);
        if (pk == null) {
            throw new IllegalStateException("KeyStore returned null PrivateKey for alias=" + alias);
        }
        if (pk.getEncoded() != null) {
            // Defense in depth: a real HSM-backed PrivateKey is unextractable,
            // so getEncoded() must return null. If we see bytes here, the
            // operator has misconfigured the PKCS#11 attributes and the key
            // is sitting on the JVM heap — refuse to sign.
            throw new SecurityException(
                    "PrivateKey for " + alias + " is extractable (getEncoded() != null) — "
                            + "refusing to sign. Verify CKA_SENSITIVE/CKA_EXTRACTABLE in token attributes.");
        }
        Signature sig = Signature.getInstance("SHA256withRSA", locator.provider());
        sig.initSign(pk);
        sig.update(toBeSigned);
        byte[] signed = sig.sign();
        LOG.debug("A005 sign backend={} alias={} inBytes={} outBytes={}",
                locator.backend(), alias, toBeSigned.length, signed.length);
        return Optional.of(signed);
    }

    /**
     * Visible for tests / external verifiers — never returns private material.
     */
    public Optional<PublicKey> publicKey() throws Exception {
        if (locator.backend() == KeyStoreLocator.Backend.FILE) return Optional.empty();
        KeyStore ks = locator.keyStore();
        String alias = aliasFor(locator);
        Certificate cert = ks.getCertificate(alias);
        if (cert != null) return Optional.of(cert.getPublicKey());
        // CloudHSM tokens that store the public key as a separate PUBLIC_KEY
        // object surface it under "<alias>:pub" or similar — defer to the
        // operator's labelling. For SoftHSMv2 tests we set a self-signed cert
        // so the cert path always works.
        return Optional.empty();
    }

    private static String aliasFor(KeyStoreLocator locator) {
        if (locator instanceof AwsCloudHsmKeyStoreLocator c) return c.tenantKeyLabel();
        if (locator instanceof SmartcardKeyStoreLocator s) return s.keyLabel();
        throw new IllegalStateException("No A005 alias defined for backend " + locator.backend());
    }

    private static String listAliases(KeyStore ks) throws Exception {
        StringBuilder sb = new StringBuilder("[");
        Enumeration<String> e = ks.aliases();
        boolean first = true;
        while (e.hasMoreElements()) {
            if (!first) sb.append(", ");
            sb.append(e.nextElement());
            first = false;
        }
        return sb.append(']').toString();
    }
}
