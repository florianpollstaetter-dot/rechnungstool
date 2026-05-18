package com.orangeocto.ebics.keystore;

import java.nio.charset.StandardCharsets;
import java.security.Provider;
import java.security.Security;

/**
 * Loads a {@code SunPKCS11} provider from a configuration string.
 *
 * Java 9+ removed the {@code Provider(String configArg)} constructor; the
 * supported path is {@code Provider#configure(String)} where the argument is
 * either a file path or, with the {@code "--"} prefix, an inline config block.
 * We use inline config so we don't have to drop credentials onto disk.
 */
final class Pkcs11ProviderFactory {

    private Pkcs11ProviderFactory() { }

    /**
     * Build, configure, and register a SunPKCS11 provider.
     *
     * @param name           logical provider name suffix (becomes {@code SunPKCS11-<name>})
     * @param libraryPath    absolute path to the PKCS#11 .so/.dll for the token
     * @param slotListIndex  index of the slot inside the token; null → 0
     * @param extra          additional config lines, optional, may be empty
     * @return the registered Provider instance (also added to {@link Security})
     */
    static Provider load(String name, String libraryPath, Integer slotListIndex, String extra) {
        StringBuilder cfg = new StringBuilder()
                .append("--\n")
                .append("name = ").append(name).append("\n")
                .append("library = ").append(libraryPath).append("\n")
                .append("slotListIndex = ").append(slotListIndex == null ? 0 : slotListIndex).append("\n");
        if (extra != null && !extra.isBlank()) {
            cfg.append(extra);
            if (!extra.endsWith("\n")) cfg.append('\n');
        }

        Provider base = Security.getProvider("SunPKCS11");
        if (base == null) {
            throw new IllegalStateException(
                    "SunPKCS11 provider not available — JDK build without PKCS#11 support");
        }
        Provider configured = base.configure(cfg.toString());
        String fqName = "SunPKCS11-" + name;
        // Avoid double-register on hot reload — Security.addProvider is idempotent
        // for the same name but logs a warning, which we'd rather not emit.
        if (Security.getProvider(fqName) == null) {
            Security.addProvider(configured);
        }
        return Security.getProvider(fqName) != null ? Security.getProvider(fqName) : configured;
    }

    /**
     * Visible for tests: produce the inline config that would be passed to
     * {@link Provider#configure(String)}. Lets tests assert config without
     * actually loading a token.
     */
    static byte[] renderConfig(String name, String libraryPath, Integer slotListIndex, String extra) {
        StringBuilder cfg = new StringBuilder()
                .append("name = ").append(name).append("\n")
                .append("library = ").append(libraryPath).append("\n")
                .append("slotListIndex = ").append(slotListIndex == null ? 0 : slotListIndex).append("\n");
        if (extra != null && !extra.isBlank()) {
            cfg.append(extra);
            if (!extra.endsWith("\n")) cfg.append('\n');
        }
        return cfg.toString().getBytes(StandardCharsets.UTF_8);
    }

    /**
     * Strict pre-check that the supplied path looks like a PKCS#11 module —
     * exists, is readable, and is a regular file. Loader errors from
     * SunPKCS11 are otherwise opaque (UnsatisfiedLinkError with hex offsets).
     */
    static void requireLoadable(String libraryPath) {
        if (libraryPath == null || libraryPath.isBlank()) {
            throw new IllegalArgumentException("PKCS#11 library path is required");
        }
        java.io.File f = new java.io.File(libraryPath);
        if (!f.isFile() || !f.canRead()) {
            throw new IllegalArgumentException(
                    "PKCS#11 library not loadable at " + libraryPath
                            + " (file exists? " + f.exists() + ", readable? " + f.canRead() + ")");
        }
    }

}
