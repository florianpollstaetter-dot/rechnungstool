package com.orangeocto.ebicsmock;

import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Tracks which subscriber-bootstrap steps (INI, HIA) have been seen so HPB
 * responses can be generated only after both are recorded. State is in-memory
 * and resets per process; the smoke flow exercises everything within one run.
 */
@Component
public class SubscriberRegistry {

    private static final Logger LOG = LoggerFactory.getLogger(SubscriberRegistry.class);

    private final ConcurrentHashMap<String, Instant> seen = new ConcurrentHashMap<>();
    private final AtomicLong orderCounter = new AtomicLong(1);

    public void recordKeyManagement(String orderType) {
        seen.put(orderType, Instant.now());
        LOG.info("subscriber state: {} recorded (seen now = {})", orderType, seen.keySet());
    }

    public String nextOrderId() {
        // EBICS order-ids are typically 4 chars [A-Z0-9]; we keep them short
        // and uppercase for downstream regex compatibility.
        long n = orderCounter.getAndIncrement();
        return String.format("A%03d", n % 1000);
    }
}
