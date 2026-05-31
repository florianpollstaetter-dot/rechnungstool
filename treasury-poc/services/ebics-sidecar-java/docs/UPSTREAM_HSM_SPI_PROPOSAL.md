# Upstream PR proposal — external-key SPI for `ebics-java-client`

Companion to [`HSM_INTEGRATION_GAP.md`](./HSM_INTEGRATION_GAP.md). Concrete
design for the upstream patch we will offer to
[github.com/ebics-java/ebics-java-client](https://github.com/ebics-java/ebics-java-client),
including the fork-fallback plan if upstream is unresponsive.

Tracked as [ORA-2311](https://paperclip/issues/ORA-2311).

## Design goals

1. **Additive, non-breaking.** Existing callers see no behaviour change.
2. **Minimal surface.** One overload of `createUser(...)` + one new factory
   interface. No refactor of `CertificateManager`, no breaking of `User`.
3. **Provider-agnostic.** Patch accepts any `java.security.PrivateKey`. Whether
   the key sits in SunPKCS11, BouncyCastleFipsProvider, or a JCE software
   provider is invisible to the library.
4. **DSGVO-safe by default.** If the caller passes external keys, the library
   **must not** also call `KeyUtil.makeKeyPair(...)` for the same role —
   double-generation is a leak.

## The patch (draft — pseudocode + diff sketch)

### 1. New SPI interface

```java
package org.kopi.ebics.client;

import java.security.PrivateKey;
import java.security.cert.X509Certificate;

/**
 * Supplies the A005/X002/E002 key material for a subscriber when the caller
 * holds them outside the JVM heap (HSM, smartcard, or any other PKCS#11 token).
 *
 * Implementations MUST NOT return a {@link PrivateKey} whose
 * {@code getEncoded()} is non-null when the key is intended to be HSM-resident
 * — that would indicate the key escaped the token. The library does not assert
 * this invariant; callers must.
 *
 * Returned arrays must be 2-element: {privateKey, x509Certificate} per role.
 */
public interface ExternalKeyProvider {

    /** Authentication / digital-signature key (EBICS role A005). */
    KeyMaterial a005();

    /** Identification & authentication key (EBICS role X002). */
    KeyMaterial x002();

    /** Encryption key (EBICS role E002). */
    KeyMaterial e002();

    record KeyMaterial(PrivateKey privateKey, X509Certificate certificate) {
        public KeyMaterial {
            if (privateKey == null) throw new IllegalArgumentException("privateKey");
            if (certificate == null) throw new IllegalArgumentException("certificate");
        }
    }
}
```

### 2. New `EbicsClient.createUser(...)` overload

```java
public User createUser(URL url, String bankName, String hostId,
    String partnerId, String userId, String name, String email,
    String country, String organization, boolean useCertificates,
    boolean saveCertificates, PasswordCallback passwordCallback,
    ExternalKeyProvider externalKeys) throws Exception {

    // 1. Build Partner+User as today.
    Bank bank = new Bank(url, bankName, hostId);
    Partner partner = new Partner(bank, partnerId, configuration);
    User user = new User(partner, userId, name, email, country, organization, passwordCallback);

    // 2. NEW: Install external keys before save().
    var a005 = externalKeys.a005();
    var x002 = externalKeys.x002();
    var e002 = externalKeys.e002();
    user.setA005PrivateKey(a005.privateKey());
    user.setA005Certificate(a005.certificate());
    user.setX002PrivateKey(x002.privateKey());
    user.setX002Certificate(x002.certificate());
    user.setE002PrivateKey(e002.privateKey());
    user.setE002Certificate(e002.certificate());

    // 3. Skip CertificateManager.create() — keys already provisioned.
    //    Still write the INI/HIA letters (uses public-key bytes only).
    createLetters(user, useCertificates);

    // 4. Persist the user record (NOT the private keys — those stay external).
    configuration.getSerializationManager().serialize(user);
    if (saveCertificates) {
        savePublicCertificatesOnly(user);   // new helper; PEM, no PKCS#12 export
    }
    return user;
}
```

### 3. `User` setter visibility

`User.setA005PrivateKey(PrivateKey)`, `setA005Certificate(X509Certificate)`,
and X002/E002 counterparts must move from package-private → `public` so the
new overload can call them. Trivial visibility change; no semantic impact.

### 4. New helper `savePublicCertificatesOnly(User)`

Replaces the PKCS#12 path (`CertificateManager.save()` → `writePKCS12Certificate`)
when external keys are used. Writes the three certificates as PEM in the user
directory so the existing INI/HIA letter renderer keeps working. Private keys
are never touched.

## Tests we will ship with the upstream PR

1. `EbicsClientExternalKeysTest` — happy path: synthetic JCE software keys
   passed via `ExternalKeyProvider`; verifies `createUser` succeeds and no
   `*.p12` is written in the user dir.
2. `EbicsClientExternalKeysGuardTest` — null provider OR partial provider
   (only A005, not X002/E002) → `IllegalArgumentException` with a clear
   message at the boundary.
3. `EbicsClientExternalKeysSignatureTest` — uses `Signature.getInstance("SHA256withRSA", "SunPKCS11-SoftHSM")`
   to sign a synthetic INI payload, gated by `SOFTHSM2_MODULE` env (mirror of
   our `hsm-smoke` profile). Skipped on hosts without SoftHSM.

## How our sidecar consumes the patched library

Once upstream cuts a release with this overload:

```diff
- if (!(keystore instanceof FileKeyStoreLocator)) {
-     throw new IllegalStateException("EBICS_KEYSTORE_BACKEND=" + keystore.backendName() +
-         " not yet wired into upstream ebics-java-client. See ORA-2311.");
- }
- c = EbicsClient.createEbicsClient(rootDir, configFile);
+ c = EbicsClient.createEbicsClient(rootDir, configFile);
+ if (!(keystore instanceof FileKeyStoreLocator file)) {
+     ExternalKeyProvider provider = ExternalKeyProviders.from(keystore);
+     // createUser overload accepting provider — used inside user() below.
+     // No change to the createUser(...) call site beyond passing `provider`.
+ }
```

…where `ExternalKeyProviders.from(keystore)` is a 1-screen adapter that
returns `Pkcs11A005Signer`-derived `KeyMaterial` triples per role. The
`SoftHsmA005SigningTest` we already ship covers the wiring at the JCE level;
the new INI/HIA assertion (no `*.p12` for the test subscriber) is the
acceptance check on this issue.

## Submission plan

| Step | Owner | Time |
| --- | --- | --- |
| Open upstream issue describing the gap (link to this doc). | CEO via Orange-Octo GitHub org account. | T+0 |
| Open draft PR with the patch above + tests. | CEO via same. | T+0 to T+3d |
| Reviewer feedback cycle. | Upstream maintainers (`@ebics-java/maintainers`). | T+3d to T+4w |
| Either: merge + JitPack release → bump `ebics.version` in our `pom.xml`. | Treasury Engineer, this ticket. | T+4w to T+6w |
| Or: 4-week timeout → execute fork plan below. | Treasury Engineer + CEO. | T+4w |

Note: the upstream PR must come from a GitHub account that can fork
`ebics-java/ebics-java-client`. The agent (`ddba9f2d-…`) does not currently
hold a GitHub token with fork+PR permissions, so CEO is the unblock owner for
the initial PR submission.

## Fork fallback — `com.orangeocto:ebics-java-client-hsm`

If the upstream PR sits silent or is rejected:

1. Fork to `github.com/orange-octo/ebics-java-client-hsm`.
2. Apply the patch above on a branch `hsm-spi-v1`.
3. Publish via JitPack: tag `v2.0.0-hsm.1`.
4. Pom swap:

```xml
- <groupId>com.github.ebics-java</groupId>
- <artifactId>ebics-java-client</artifactId>
- <version>${ebics.version}</version>
+ <groupId>com.github.orange-octo</groupId>
+ <artifactId>ebics-java-client-hsm</artifactId>
+ <version>v2.0.0-hsm.1</version>
```

5. Rebase policy: every upstream release tag → rebase the `hsm-spi-v1` branch
   onto it; cut a new JitPack tag (`vX.Y.Z-hsm.N`). Cron-friendly with a
   1×/quarter cadence per `HSM_KEY_ROTATION.md`'s decommission window.
6. Once/if upstream merges the SPI, retire the fork in a single PR (revert
   pom swap; delete `ebics-java-client-hsm` repo).

## Risk register

| Risk | Mitigation |
| --- | --- |
| Upstream changes `User` internals between releases. | Fork rebase cadence (step 5). Patch is small (~80 LoC) — rebase is cheap. |
| New library release adds a new role (e.g. A006 ES) that we miss in `ExternalKeyProvider`. | Add a default method returning `null` and have the library no-op when `null` — keeps API additive. |
| Upstream merges a different design (e.g. full `CertificateManager` SPI). | Adapt: our `Pkcs11A005Signer` already abstracts the sign call. Wrap the upstream API in whatever shape they ship. |
| `BouncyCastleProvider` or `SunPKCS11` is missing in production JVM. | Already covered: `Pkcs11ProviderFactoryTest` asserts provider load at boot; sidecar refuses to start otherwise. |

## Out of scope of this proposal

- Server-side EBICS reception/decryption (this library is client-only).
- A005 key rotation flow — already documented in `HSM_KEY_ROTATION.md`.
- Real CloudHSM cluster provisioning — separate ops issue.
