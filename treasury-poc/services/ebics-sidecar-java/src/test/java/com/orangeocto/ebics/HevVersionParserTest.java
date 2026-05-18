package com.orangeocto.ebics;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * Tight unit test for the HEV version sniffer. Decouples the version-string
 * mapping from any real bank — important because HEV is the cheapest
 * connectivity check and we never want a regression here to mask an EBICS-3.0
 * misconfiguration.
 */
class HevVersionParserTest {

    @Test
    void picks_last_supported_version_block() {
        String body = """
            <HEVResponse xmlns="http://www.ebics.org/H000">
              <VersionNumber ProtocolVersion="H003">2.4</VersionNumber>
              <VersionNumber ProtocolVersion="H004">2.5</VersionNumber>
              <VersionNumber ProtocolVersion="H005">3.0</VersionNumber>
            </HEVResponse>
            """;
        assertEquals("3.0", RealEbicsClientFacade.extractSupportedVersion(body));
    }

    @Test
    void maps_h004_to_2_5() {
        String body = "<VersionNumber>H004</VersionNumber>";
        assertEquals("2.5", RealEbicsClientFacade.extractSupportedVersion(body));
    }

    @Test
    void returns_raw_code_for_unknown_version() {
        String body = "<VersionNumber>H999</VersionNumber>";
        assertEquals("H999", RealEbicsClientFacade.extractSupportedVersion(body));
    }

    @Test
    void returns_null_for_no_match() {
        assertNull(RealEbicsClientFacade.extractSupportedVersion("<no-version-here/>"));
    }

    @Test
    void returns_null_for_null_input() {
        assertNull(RealEbicsClientFacade.extractSupportedVersion(null));
    }
}
