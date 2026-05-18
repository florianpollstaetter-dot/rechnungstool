package com.orangeocto.ebics.keystore;

import org.junit.jupiter.api.Test;

import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class KeyStoreLocatorTest {

    @Test
    void file_locator_exposes_dir_password_and_no_provider() {
        FileKeyStoreLocator f = new FileKeyStoreLocator(Path.of("/tmp/x"), "pw");
        assertEquals(KeyStoreLocator.Backend.FILE, f.backend());
        assertEquals(Path.of("/tmp/x"), f.dir());
        assertEquals("pw", f.password());
        assertNull(f.provider());
        assertNull(f.keyStore());
    }
}
