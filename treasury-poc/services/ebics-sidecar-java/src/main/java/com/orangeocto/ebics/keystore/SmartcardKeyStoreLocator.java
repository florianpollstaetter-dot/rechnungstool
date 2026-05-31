package com.orangeocto.ebics.keystore;

import java.nio.file.Path;
import java.security.KeyStore;
import java.security.Provider;

/**
 * Pro-Tier fallback locator: PKCS#11 against a local smartcard (OpenSC).
 *
 * <p>Default library path: {@code /usr/lib/x86_64-linux-gnu/opensc-pkcs11.so}
 * on Debian/Ubuntu hosts; override via {@code EBICS_SMARTCARD_PKCS11_LIB}.
 * Card insertion is manual; the locator does not poll — it opens the JCE
 * KeyStore on demand. If the card is absent, {@link #keyStore()} surfaces a
 * PKCS#11 error to the caller, who then prompts the operator.
 *
 * <p>Unlike CloudHSM, smartcards typically expose a single token (slot 0).
 * Multi-tenant Pro-tier hosts are out of scope for this fallback.
 *
 * <p>DSGVO: same heap-safety guarantee as CloudHSM — A005 private key
 * material stays on the card, sign operations execute on-card.
 */
public final class SmartcardKeyStoreLocator implements KeyStoreLocator {

    private final Path dir;
    private final String pin;
    private final String libraryPath;
    private final Integer slotListIndex;
    private final String keyLabel;
    private final Provider provider;

    public SmartcardKeyStoreLocator(
            Path dir,
            String pin,
            String libraryPath,
            Integer slotListIndex,
            String keyLabel) {
        this.dir = dir;
        this.pin = pin;
        this.libraryPath = libraryPath;
        this.slotListIndex = slotListIndex;
        this.keyLabel = keyLabel;
        Pkcs11ProviderFactory.requireLoadable(libraryPath);
        this.provider = Pkcs11ProviderFactory.load("smartcard", libraryPath, slotListIndex, null);
    }

    public String keyLabel() { return keyLabel; }

    @Override public Backend backend() { return Backend.SMARTCARD; }

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
                    "Failed to open PKCS#11 KeyStore via SunPKCS11-smartcard. "
                            + "Card inserted? PIN correct? library=" + libraryPath, e);
        }
    }
}
