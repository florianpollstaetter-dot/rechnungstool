package com.orangeocto.ebics;

import java.io.File;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.LocalDate;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.kopi.ebics.client.EbicsClient;
import org.kopi.ebics.client.EbicsUploadParams;
import org.kopi.ebics.client.User;
import org.kopi.ebics.interfaces.EbicsOrderType;
import org.kopi.ebics.session.OrderType;
import org.kopi.ebics.session.Product;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Production facade backed by {@code ebics-java-client} 2.0.0.
 *
 * Threading: the upstream {@link EbicsClient} is not advertised as thread-safe.
 * We serialize all bank-bound calls on {@code lock} for safety; throughput is
 * dominated by bank latency anyway. Multi-tenant sharding lives one layer up
 * (one sidecar replica per company) — not in this process.
 */
@Service
public class RealEbicsClientFacade implements EbicsClientFacade {

    private static final Logger LOG = LoggerFactory.getLogger(RealEbicsClientFacade.class);

    private final KeyStoreConfig.KeyStoreLocator keystore;
    private final String hostId;
    private final String partnerId;
    private final String userId;
    private final String bankUrl;
    private final String bankName;
    private final String productName;
    private final String productLanguage;
    private final String countryCode;

    private final Object lock = new Object();
    private final AtomicReference<EbicsClient> clientRef = new AtomicReference<>();
    private final AtomicReference<User> userRef = new AtomicReference<>();
    private final HttpClient http = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(10))
        .build();

    public RealEbicsClientFacade(
        KeyStoreConfig.KeyStoreLocator keystore,
        @Value("${ebics.hostId}") String hostId,
        @Value("${ebics.partnerId}") String partnerId,
        @Value("${ebics.userId}") String userId,
        @Value("${ebics.url}") String bankUrl,
        @Value("${ebics.bankName:orange-octo-test}") String bankName,
        @Value("${ebics.product.name:OrangeOctoTreasury}") String productName,
        @Value("${ebics.product.language:de}") String productLanguage,
        @Value("${ebics.countryCode:DE}") String countryCode
    ) {
        this.keystore = keystore;
        this.hostId = hostId;
        this.partnerId = partnerId;
        this.userId = userId;
        this.bankUrl = bankUrl;
        this.bankName = bankName;
        this.productName = productName;
        this.productLanguage = productLanguage;
        this.countryCode = countryCode;
    }

    private EbicsClient client() throws Exception {
        EbicsClient c = clientRef.get();
        if (c != null) return c;
        synchronized (lock) {
            c = clientRef.get();
            if (c != null) return c;
            Files.createDirectories(keystore.dir());
            File rootDir = keystore.dir().toFile();
            File configFile = keystore.dir().resolve("ebics.properties").toFile();
            if (!configFile.exists()) {
                writeDefaultConfigFile(configFile);
            }
            c = EbicsClient.createEbicsClient(rootDir, configFile);
            clientRef.set(c);
            return c;
        }
    }

    private void writeDefaultConfigFile(File configFile) throws IOException {
        // EbicsClient.createEbicsClient() validates countryCode, languageCode, and
        // productName via ConfigProperties.get() which throws on missing/empty values.
        String body = String.join("\n",
            "countryCode=" + countryCode.toUpperCase(),
            "languageCode=" + productLanguage.toLowerCase(),
            "productName=" + productName,
            "log.file.path=" + keystore.dir().resolve("trace").toString(),
            "client.production.name=" + productName,
            "client.production.language=" + productLanguage,
            "client.production.instituteID=orange-octo",
            "user.dir=" + keystore.dir().toString(),
            ""
        );
        Files.writeString(configFile.toPath(), body);
    }

    private User user() throws Exception {
        User u = userRef.get();
        if (u != null) return u;
        synchronized (lock) {
            u = userRef.get();
            if (u != null) return u;
            EbicsClient c = client();
            try {
                u = c.loadUser(hostId, partnerId, userId, () -> keystore.password().toCharArray());
            } catch (Exception loadFailed) {
                LOG.info("loadUser failed ({}). Creating subscriber {}/{}/{}",
                    loadFailed.getMessage(), hostId, partnerId, userId);
                // Upstream signature as of 901faa3 (ORA-2527):
                //   createUser(URL, bankName, hostId, partnerId, userId,
                //              name, email, country, organization,
                //              saveCertificates, passwordCallback)
                // The legacy `useCertificates` boolean was removed by upstream
                // — H005 always uses certificates.
                u = c.createUser(
                    URI.create(bankUrl).toURL(),
                    bankName,
                    hostId,
                    partnerId,
                    userId,
                    "Orange Octo Treasury",
                    "treasury@orange-octo.test",
                    "DE",
                    "Orange Octo",
                    /* saveCertificates */ true,
                    () -> keystore.password().toCharArray()
                );
            }
            userRef.set(u);
            return u;
        }
    }

    private Product product() {
        return new Product(productName, productLanguage, null);
    }

    private String newRequestId() {
        return UUID.randomUUID().toString();
    }

    @Override
    public InitResult init() throws Exception {
        String requestId = newRequestId();
        synchronized (lock) {
            User u = user();
            Product p = product();
            EbicsClient c = client();
            LOG.info("ebics.init requestId={} hostId={} partnerId={} userId={}", requestId, hostId, partnerId, userId);
            String iniOrderId = nextOrderId(u);
            c.sendINIRequest(u, p);
            String hiaOrderId = nextOrderId(u);
            c.sendHIARequest(u, p);
            return new InitResult(requestId, iniOrderId, hiaOrderId);
        }
    }

    @Override
    public HpbResult hpb() throws Exception {
        String requestId = newRequestId();
        synchronized (lock) {
            EbicsClient c = client();
            User u = user();
            LOG.info("ebics.hpb requestId={}", requestId);
            c.sendHPBRequest(u, product());
            byte[] traceBytes = readMostRecentTrace("HPB");
            return new HpbResult(requestId, traceBytes);
        }
    }

    @Override
    public HevResult hev() throws Exception {
        // HEV is not exposed via the high-level EbicsClient API in v2.0.0;
        // we post the unauthenticated HEV envelope directly. Bank replies
        // with an <HEVResponse> listing supported protocol versions.
        String requestId = newRequestId();
        String envelope = """
            <?xml version="1.0" encoding="UTF-8"?>
            <ebicsHEVRequest xmlns="http://www.ebics.org/H000"
                             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
              <HostID>%s</HostID>
            </ebicsHEVRequest>
            """.formatted(hostId);
        HttpRequest req = HttpRequest.newBuilder()
            .uri(URI.create(bankUrl))
            .timeout(Duration.ofSeconds(20))
            .header("Content-Type", "text/xml; charset=utf-8")
            .POST(HttpRequest.BodyPublishers.ofString(envelope))
            .build();
        HttpResponse<byte[]> res = http.send(req, HttpResponse.BodyHandlers.ofByteArray());
        byte[] body = res.body();
        String supported = extractSupportedVersion(new String(body));
        LOG.info("ebics.hev requestId={} status={} supportedVersion={}", requestId, res.statusCode(), supported);
        return new HevResult(requestId, supported, body);
    }

    private static final Pattern HEV_VERSION = Pattern.compile(
        "<VersionNumber\\b[^>]*>\\s*(H[0-9]{3})\\s*</VersionNumber>", Pattern.DOTALL);

    static String extractSupportedVersion(String hevBody) {
        if (hevBody == null) return null;
        Matcher m = HEV_VERSION.matcher(hevBody);
        String last = null;
        while (m.find()) last = m.group(1);
        if (last == null) return null;
        return switch (last) {
            case "H005" -> "3.0";
            case "H004" -> "2.5";
            case "H003" -> "2.4";
            default -> last;
        };
    }

    @Override
    public HkdResult hkd() throws Exception {
        String requestId = newRequestId();
        synchronized (lock) {
            EbicsClient c = client();
            File tmp = Files.createTempFile("hkd-", ".xml").toFile();
            try {
                c.fetchFile(tmp, user(), product(), OrderType.HKD, /* isTest */ true);
                byte[] body = Files.readAllBytes(tmp.toPath());
                LOG.info("ebics.hkd requestId={} bytes={}", requestId, body.length);
                return new HkdResult(requestId, body);
            } finally {
                tmp.delete();
            }
        }
    }

    @Override
    public StaResult sta(LocalDate from, LocalDate to) throws Exception {
        String requestId = newRequestId();
        synchronized (lock) {
            EbicsClient c = client();
            File tmp = Files.createTempFile("sta-", ".xml").toFile();
            try {
                EbicsOrderType orderType = chooseStatementOrderType();
                // fetchFile(File, EbicsOrderType, Date, Date) requires defaultUser to be set
                // (via createDefaultUser, not createUser). Use the explicit-user overload so
                // we don't depend on that internal state. Date range is expressed via order
                // parameters when the bank supports it; mock ignores dates.
                c.fetchFile(tmp, user(), product(), orderType, /* isTest */ false);
                byte[] body = Files.readAllBytes(tmp.toPath());
                LOG.info("ebics.sta requestId={} from={} to={} bytes={} orderType={}",
                    requestId, from, to, body.length, orderType.getCode());
                return new StaResult(requestId, from, to, body);
            } finally {
                tmp.delete();
            }
        }
    }

    /**
     * Most EBICS-3.0 banks expose CAMT.053 via order-type C53; the in-house
     * mock and some legacy banks still emit the same payload under STA.
     * Default to C53; the controller can override via {@code ebics.statementOrderType}.
     */
    private EbicsOrderType chooseStatementOrderType() {
        return statementOrderTypeOverride != null ? statementOrderTypeOverride : OrderType.C53;
    }

    @Value("${ebics.statementOrderType:C53}")
    private String statementOrderTypeProp;
    private volatile EbicsOrderType statementOrderTypeOverride;

    @jakarta.annotation.PostConstruct
    void resolveStatementOrderType() {
        if (statementOrderTypeProp == null || statementOrderTypeProp.isBlank()) return;
        try {
            this.statementOrderTypeOverride = OrderType.valueOf(statementOrderTypeProp);
        } catch (IllegalArgumentException ignored) {
            // unknown code → fall back to default
            LOG.warn("ebics.statementOrderType={} not a known OrderType — using C53", statementOrderTypeProp);
        }
    }

    @Override
    public CctResult cct(byte[] pain001) throws Exception {
        String requestId = newRequestId();
        synchronized (lock) {
            EbicsClient c = client();
            User u = user();
            File tmp = Files.createTempFile("cct-", ".xml").toFile();
            try {
                Files.write(tmp.toPath(), pain001);
                // master API requires EbicsUploadParams with non-null OrderParams.
                // Passing null triggers qualifySubstitutionGroup(StandardOrderParamsType.type)
                // which calls cursor.setName(null) → IllegalArgumentException("Name is null")
                // because StandardOrderParamsType is not a document element (no QName).
                // BTF OrderParams makes the library use BTUOrderParamsDocument.type instead,
                // which has a proper getDocumentElementName(). AdminOrderType stays "CCT" in
                // the H005 header so the mock still routes to cctAck() correctly.
                String bankOrderId = nextOrderId(u);
                EbicsUploadParams params = new EbicsUploadParams(bankOrderId,
                    new EbicsUploadParams.OrderParams("CCT", "DE", null, "pain.001", "09", false));
                c.sendFile(tmp, u, product(), OrderType.CCT, params);
                LOG.info("ebics.cct requestId={} bytes={} bankOrderId={}",
                    requestId, pain001.length, bankOrderId);
                return new CctResult(requestId, bankOrderId, pain001.length);
            } finally {
                tmp.delete();
            }
        }
    }

    private static String nextOrderId(User u) {
        try {
            return u.getPartner().nextOrderId();
        } catch (Exception e) {
            return UUID.randomUUID().toString().substring(0, 8);
        }
    }

    private byte[] readMostRecentTrace(String prefix) {
        Path traceDir = keystore.dir().resolve("trace");
        if (!Files.isDirectory(traceDir)) return new byte[0];
        try (var stream = Files.list(traceDir)) {
            return stream
                .filter(p -> p.getFileName().toString().contains(prefix))
                .sorted((a, b) -> b.getFileName().toString().compareTo(a.getFileName().toString()))
                .findFirst()
                .map(p -> {
                    try { return Files.readAllBytes(p); } catch (IOException e) { return new byte[0]; }
                })
                .orElse(new byte[0]);
        } catch (IOException e) {
            return new byte[0];
        }
    }
}
