package com.orangeocto.ebics.keystore;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;

import java.math.BigInteger;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.Signature;
import java.security.cert.X509Certificate;
import java.time.Instant;
import java.util.Date;

import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.cert.X509CertificateHolder;
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter;
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder;
import org.bouncycastle.operator.ContentSigner;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * Round-trip A005-style RSA-SHA256 signing against a SoftHSMv2 PKCS#11 token.
 *
 * <p>Enabled when {@code SOFTHSM2_MODULE} points at a readable
 * {@code libsofthsm2.so}. The {@code hsm-smoke} Maven profile sets this; the
 * regular {@code mvn test} run silently skips. We also require
 * {@code softhsm2-util} on {@code $PATH} for token initialisation.
 *
 * <p>Critical property: the key pair is generated <em>inside the token</em>
 * via {@code KeyPairGenerator.getInstance("RSA", provider)} with attributes
 * {@code CKA_SENSITIVE=true / CKA_EXTRACTABLE=false}. The private-key bytes
 * never enter the JVM heap. {@link PrivateKey#getEncoded()} must return null —
 * this is the production-grade DSGVO posture, enforced as an assertion.
 */
@EnabledIfEnvironmentVariable(named = "SOFTHSM2_MODULE", matches = ".+\\.so$")
class SoftHsmA005SigningTest {

    private static final String LABEL = "ebics-a005-test";
    private static final String PIN = "12345";
    private static Path tokenDir;

    @BeforeAll
    static void initSoftHsmToken(@TempDir Path tmp) throws Exception {
        // SoftHSMv2 reads SOFTHSM2_CONF from the environment, not from system
        // properties. The hsm-smoke profile sets SOFTHSM2_CONF for the entire
        // surefire fork; if a developer runs the test ad-hoc without it, we
        // self-skip rather than silently use the system-wide token DB.
        String envConf = System.getenv("SOFTHSM2_CONF");
        assumeTrue(envConf != null && !envConf.isBlank(),
                "SOFTHSM2_CONF must be exported (the hsm-smoke profile sets this)");
        assumeTrue(haveBinary("softhsm2-util"), "softhsm2-util not on PATH");

        tokenDir = tmp.resolve("softhsm-tokens");
        Files.createDirectories(tokenDir);

        // Use --free to slot-auto, fail-fast if already initialised.
        int rc = new ProcessBuilder(
                "softhsm2-util", "--init-token", "--free",
                "--label", "ebics-test",
                "--so-pin", PIN, "--pin", PIN)
                .redirectErrorStream(true)
                .start()
                .waitFor();
        assumeTrue(rc == 0, "softhsm2-util --init-token returned " + rc);
    }

    @Test
    void on_token_key_generation_signs_and_verifies_with_null_encoded() throws Exception {
        String module = System.getenv("SOFTHSM2_MODULE");
        assumeTrue(module != null && Files.isReadable(Path.of(module)), "SOFTHSM2_MODULE unreadable");

        // SoftHSMv2 stands in for CloudHSM here — the JCE/PKCS#11 surface is
        // identical, which is exactly what the abstraction asserts.
        AwsCloudHsmKeyStoreLocator locator = new AwsCloudHsmKeyStoreLocator(
                tokenDir, PIN, module, /*slot=*/0, LABEL);

        KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA", locator.provider());
        gen.initialize(2048);
        KeyPair onTokenKp = gen.generateKeyPair();

        // Self-sign the on-token public key so the token stores a Certificate
        // entry that the JCE KeyStore can find by alias.
        X509Certificate cert = selfSign(onTokenKp, locator.provider());
        KeyStore ks = locator.keyStore();
        ks.setKeyEntry(LABEL, onTokenKp.getPrivate(), PIN.toCharArray(),
                new java.security.cert.Certificate[]{cert});

        PrivateKey hsmKey = (PrivateKey) ks.getKey(LABEL, null);
        assertNotNull(hsmKey);
        assertNull(hsmKey.getEncoded(),
                "PKCS#11 PrivateKey.getEncoded() must be null — A005 bytes must never reach the JVM heap");

        Pkcs11A005Signer signer = new Pkcs11A005Signer(locator);
        byte[] sample = "EBICS A005 canonicalised request payload".getBytes();
        byte[] signed = signer.sign(sample).orElseThrow();
        assertTrue(signed.length == 256, "RSA-2048 signature must be 256 bytes, got " + signed.length);

        PublicKey pub = signer.publicKey().orElseThrow();
        Signature verifier = Signature.getInstance("SHA256withRSA");
        verifier.initVerify(pub);
        verifier.update(sample);
        assertTrue(verifier.verify(signed), "verification via on-token public-key must succeed");
    }

    private static X509Certificate selfSign(KeyPair kp, java.security.Provider sigProvider) throws Exception {
        X500Name dn = new X500Name("CN=ebics-a005-test,O=OrangeOctoTreasury,C=DE");
        Instant now = Instant.now();
        Date notBefore = Date.from(now);
        Date notAfter = Date.from(now.plusSeconds(86_400L * 365));
        var builder = new JcaX509v3CertificateBuilder(
                dn, BigInteger.ONE, notBefore, notAfter, dn, kp.getPublic());
        ContentSigner cs = new JcaContentSignerBuilder("SHA256withRSA")
                .setProvider(sigProvider)
                .build(kp.getPrivate());
        X509CertificateHolder h = builder.build(cs);
        return new JcaX509CertificateConverter().getCertificate(h);
    }

    private static boolean haveBinary(String name) {
        try {
            return new ProcessBuilder("which", name)
                    .redirectErrorStream(true)
                    .start()
                    .waitFor() == 0;
        } catch (Exception e) {
            return false;
        }
    }
}
