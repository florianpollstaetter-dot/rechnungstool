package com.orangeocto.ebics.keystore;

import java.nio.file.Path;
import java.security.KeyStore;
import java.security.Provider;

/**
 * PoC default. The upstream {@code ebics-java-client} owns its own PKCS#12
 * keystore under {@code dir}; this locator just hands over the path/password.
 * Not for production use beyond dev/sandbox tenants — Pro/Enterprise tenants
 * must select one of the HSM backends.
 */
public record FileKeyStoreLocator(Path dir, String password) implements KeyStoreLocator {

    @Override
    public Backend backend() { return Backend.FILE; }

    @Override
    public Provider provider() { return null; }

    @Override
    public KeyStore keyStore() { return null; }
}
