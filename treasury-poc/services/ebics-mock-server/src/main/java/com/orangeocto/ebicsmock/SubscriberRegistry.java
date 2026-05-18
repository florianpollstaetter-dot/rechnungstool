package com.orangeocto.ebicsmock;

import java.security.interfaces.RSAPublicKey;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * In-memory subscriber state: tracks key-management steps (INI/HIA) and
 * stores the subscriber's E002 encryption public key so download responses
 * can be properly AES-encrypted and the transaction key RSA-wrapped.
 */
@Component
public class SubscriberRegistry {

    private static final Logger LOG = LoggerFactory.getLogger(SubscriberRegistry.class);

    private final ConcurrentHashMap<String, Instant> seen = new ConcurrentHashMap<>();
    private final AtomicLong orderCounter = new AtomicLong(1);
    private final AtomicReference<RSAPublicKey> subscriberE002Key = new AtomicReference<>();

    public void recordKeyManagement(String orderType) {
        seen.put(orderType, Instant.now());
        LOG.info("subscriber state: {} recorded (seen={})", orderType, seen.keySet());
    }

    public void storeSubscriberE002Key(RSAPublicKey key) {
        subscriberE002Key.set(key);
        LOG.info("subscriber E002 encryption key stored ({})", key.getAlgorithm());
    }

    /** Returns null until the HIA E002 key has been parsed and stored. */
    public RSAPublicKey getSubscriberE002Key() {
        return subscriberE002Key.get();
    }

    public String nextOrderId() {
        long n = orderCounter.getAndIncrement();
        return String.format("A%03d", n % 1000);
    }
}
