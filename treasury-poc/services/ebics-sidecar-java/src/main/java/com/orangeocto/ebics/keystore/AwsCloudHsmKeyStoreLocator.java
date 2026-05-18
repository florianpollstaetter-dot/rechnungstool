package com.orangeocto.ebics.keystore;

import java.nio.file.Path;
import java.security.KeyStore;
import java.security.Provider;

/**
 * PKCS#11 locator for AWS CloudHSM (Frankfurt, {@code eu-central-1}).
 *
 * <p>Backed by the official CloudHSM PKCS#11 library — by default at
 * {@code /opt/cloudhsm/lib/libcloudhsm_pkcs11.so} — registered under the JCE
 * via {@link sun.security.pkcs11.SunPKCS11}. The cluster IP, customer CA cert,
 * and crypto-user credentials are sourced from the CloudHSM client config
 * (/opt/cloudhsm/etc/cloudhsm-pkcs11.cfg) which the bootstrap script
 * provisions.
 *
 * <p>DSGVO: private keys are generated and used inside the HSM. {@code
 * getEncoded()} on the returned {@link java.security.PrivateKey} returns
 * {@code null}; sign operations route to the device. We never read the key
 * bytes into JVM heap.
 *
 * <p>Sign-operation flow (for the EBICS A005 / X002 / E002 use case):
 * <pre>
 *   KeyStore ks = locator.keyStore();
 *   PrivateKey a005 = (PrivateKey) ks.getKey("ebics-a005-<tenant>", null);
 *   Signature sig = Signature.getInstance("SHA256withRSA", locator.provider());
 *   sig.initSign(a005);
 *   sig.update(canonicalizedXmlBytes);
 *   byte[] signed = sig.sign();   // PKCS#11 C_Sign inside HSM
 * </pre>
 *
 * <p>Heap-tracing assertion is enforced by {@code Pkcs11HeapAssertions} in
 * the integration test suite.
 */
public final class AwsCloudHsmKeyStoreLocator implements KeyStoreLocator {

    private final Path dir;
    private final String pin;
    private final String libraryPath;
    private final Integer slotListIndex;
    private final String tenantKeyLabel;
    private final Provider provider;

    public AwsCloudHsmKeyStoreLocator(
            Path dir,
            String pin,
            String libraryPath,
            Integer slotListIndex,
            String tenantKeyLabel) {
        this.dir = dir;
        this.pin = pin;
        this.libraryPath = libraryPath;
        this.slotListIndex = slotListIndex;
        this.tenantKeyLabel = tenantKeyLabel;
        Pkcs11ProviderFactory.requireLoadable(libraryPath);
        this.provider = Pkcs11ProviderFactory.load(
                "cloudhsm",
                libraryPath,
                slotListIndex,
                // attributes(*,CKO_PRIVATE_KEY,{ CKA_SENSITIVE = true, CKA_EXTRACTABLE = false })
                // is implicit on CloudHSM, but we declare it for any token that respects the
                // template — defense in depth against accidental key export.
                "attributes(*,CKO_PRIVATE_KEY,*) = {\n"
                        + "  CKA_TOKEN = true\n"
                        + "  CKA_SENSITIVE = true\n"
                        + "  CKA_EXTRACTABLE = false\n"
                        + "}\n");
    }

    /** Tenant key label for tenancy-scoped A005 lookup, e.g. {@code ebics-a005-acme}. */
    public String tenantKeyLabel() { return tenantKeyLabel; }

    @Override public Backend backend() { return Backend.AWS_CLOUDHSM; }

    @Override public Path dir() { return dir; }

    @Override public String password() { return pin; }

    @Override public Provider provider() { return provider; }

    @Override
    public KeyStore keyStore() {
        try {
            KeyStore ks = KeyStore.getInstance("PKCS11", provider);
            ks.load(null, pin == null ? null : pin.toCharArray());
            return ks;
        } catch (Exception e) {
            throw new IllegalStateException(
                    "Failed to open PKCS#11 KeyStore via SunPKCS11-cloudhsm (library="
                            + libraryPath + ", slotIndex=" + slotListIndex + ")", e);
        }
    }
}
