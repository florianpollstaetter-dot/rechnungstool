package com.orangeocto.ebics;

import java.time.LocalDate;

/**
 * Narrow seam between the Spring REST surface and {@code ebics-java-client}.
 *
 * Two impls exist:
 *  - {@code RealEbicsClientFacade} — calls the upstream library against a real bank.
 *  - {@code StubEbicsClientFacade} — used in unit tests; returns deterministic fixtures.
 *
 * Every method returns the raw bank payload (request or response bytes) plus a
 * deterministic {@code requestId}. The Next.js consumer hashes the raw bytes for
 * the Treasury audit-chain — the sidecar itself never writes to the chain
 * (single-writer invariant lives in the Next.js side).
 */
public interface EbicsClientFacade {

    record InitResult(String requestId, String iniOrderId, String hiaOrderId) { }

    record HpbResult(String requestId, byte[] rawResponse) { }

    record HevResult(String requestId, String supportedVersion, byte[] rawResponse) { }

    record HkdResult(String requestId, byte[] rawResponse) { }

    record StaResult(String requestId, LocalDate from, LocalDate to, byte[] camt053) { }

    record CctResult(String requestId, String bankOrderId, int payloadBytes) { }

    /** INI + HIA subscriber bootstrap. Library-internally generates A005/X002/E002. */
    InitResult init() throws Exception;

    /** HPB — fetch bank public keys for authentication+encryption (E002/X002). */
    HpbResult hpb() throws Exception;

    /** HEV — probe supported EBICS protocol versions. Cheap connectivity check. */
    HevResult hev() throws Exception;

    /** HKD — pull subscriber state + authorized order types. Sanity check post-INI/HIA. */
    HkdResult hkd() throws Exception;

    /** STA / C53 — download account statements as raw CAMT.053 bytes for [from..to]. */
    StaResult sta(LocalDate from, LocalDate to) throws Exception;

    /** CCT — upload a pain.001 SEPA Credit Transfer initiation. Returns bank's order-id. */
    CctResult cct(byte[] pain001) throws Exception;
}
