package com.orangeocto.ebicsmock;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class EbicsWebControllerTest {

    @Test
    void detectsHevRootElement() {
        String body = "<?xml version=\"1.0\"?><ebicsHEVRequest xmlns=\"http://www.ebics.org/H000\"><HostID>OCTOPOC</HostID></ebicsHEVRequest>";
        assertEquals("ebicsHEVRequest", EbicsWebController.detectRootElement(body));
    }

    @Test
    void detectsUnsecuredRootElementWithPrefix() {
        String body = "<?xml version=\"1.0\"?><ns2:ebicsUnsecuredRequest xmlns:ns2=\"urn:org:ebics:H005\">...</ns2:ebicsUnsecuredRequest>";
        assertEquals("ebicsUnsecuredRequest", EbicsWebController.detectRootElement(body));
    }

    @Test
    void sniffsOrderType() {
        String body = "<root><OrderDetails><OrderType>HKD</OrderType></OrderDetails></root>";
        assertEquals("HKD", EbicsWebController.sniff("OrderType", body));
    }

    @Test
    void sniffsOrderTypeWithPrefix() {
        String body = "<root><x:OrderType>STA</x:OrderType></root>";
        assertEquals("STA", EbicsWebController.sniff("OrderType", body));
    }

    @Test
    void detectsUnknownRoot() {
        assertNotNull(EbicsWebController.detectRootElement("<otherRoot/>"));
        assertTrue(EbicsWebController.detectRootElement("<otherRoot/>").isEmpty());
    }
}
