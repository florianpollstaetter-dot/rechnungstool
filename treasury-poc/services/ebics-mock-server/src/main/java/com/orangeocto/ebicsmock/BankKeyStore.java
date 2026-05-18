package com.orangeocto.ebicsmock;

import java.math.BigInteger;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Security;
import java.security.cert.X509Certificate;
import java.security.interfaces.RSAPublicKey;
import java.util.Base64;
import java.util.Date;

import jakarta.annotation.PostConstruct;

import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter;
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.bouncycastle.operator.ContentSigner;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Holds the bank's X002 (authentication) and E002 (encryption) RSA keypairs
 * plus self-signed X.509 certificates. Generated at startup, never persisted.
 *
 * The HPB response advertises the DER-encoded certs so the sidecar's
 * ebics-java-client can extract the bank's public keys and store them.
 */
@Component
public class BankKeyStore {

    private static final Logger LOG = LoggerFactory.getLogger(BankKeyStore.class);
    private static final int RSA_KEY_BITS = 2048;

    private KeyPair authKeyX002;
    private KeyPair encKeyE002;
    private byte[] authCertDer;
    private byte[] encCertDer;

    @PostConstruct
    void init() throws Exception {
        Security.addProvider(new BouncyCastleProvider());
        KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA", "BC");
        gen.initialize(RSA_KEY_BITS);
        this.authKeyX002 = gen.generateKeyPair();
        this.encKeyE002  = gen.generateKeyPair();
        this.authCertDer = selfSignedDer(authKeyX002, "CN=OCTOPOC-X002");
        this.encCertDer  = selfSignedDer(encKeyE002,  "CN=OCTOPOC-E002");
        LOG.info("Bank keypairs + X.509 certs generated ({} bits)", RSA_KEY_BITS);
    }

    private static byte[] selfSignedDer(KeyPair kp, String dn) throws Exception {
        Date now    = new Date();
        Date expiry = new Date(now.getTime() + 365L * 24 * 3600 * 1000);
        X500Name name = new X500Name(dn);
        JcaX509v3CertificateBuilder builder = new JcaX509v3CertificateBuilder(
                name, BigInteger.ONE, now, expiry, name, kp.getPublic());
        ContentSigner signer = new JcaContentSignerBuilder("SHA256WithRSA")
                .setProvider("BC").build(kp.getPrivate());
        X509Certificate cert = new JcaX509CertificateConverter()
                .setProvider("BC").getCertificate(builder.build(signer));
        return cert.getEncoded();
    }

    public RSAPublicKey authPublic() { return (RSAPublicKey) authKeyX002.getPublic(); }
    public RSAPublicKey encPublic()  { return (RSAPublicKey) encKeyE002.getPublic(); }

    /** DER-encoded self-signed X.509 certificate for the X002 (auth) key. */
    public byte[] authCertDer() { return authCertDer; }
    /** DER-encoded self-signed X.509 certificate for the E002 (enc) key. */
    public byte[] encCertDer()  { return encCertDer; }

    public static String base64(BigInteger value) {
        byte[] raw = value.toByteArray();
        if (raw.length > 1 && raw[0] == 0) {
            byte[] trimmed = new byte[raw.length - 1];
            System.arraycopy(raw, 1, trimmed, 0, trimmed.length);
            raw = trimmed;
        }
        return Base64.getEncoder().encodeToString(raw);
    }
}
