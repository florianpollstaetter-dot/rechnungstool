# HSM Integration Gap — A005/X002/E002 key origin

Scope: explains why `RealEbicsClientFacade.client()` refuses any `EBICS_KEYSTORE_BACKEND`
other than `file` even though the PKCS#11 plumbing (`AwsCloudHsmKeyStoreLocator`,
`SmartcardKeyStoreLocator`, `Pkcs11A005Signer`) is fully wired and unit-proven.

Tracked end-to-end in [ORA-2311](https://paperclip/issues/ORA-2311).

## TL;DR

`com.github.ebics-java:ebics-java-client` generates the A005/X002/E002 RSA
key pairs **inside the library**, persists them as PKCS#12 on disk, and exposes
no public seam to plug in an external HSM-backed `PrivateKey`. Until upstream
gains that seam — or we fork — Enterprise/Pro tenants on `aws-cloudhsm` or
`smartcard` cannot complete INI/HIA. The PKCS#11 layer we shipped in ORA-2309
is therefore unit-correct but unreachable from the wire.

## Why this matters

DSGVO + ISO 27001 commitments for the Treasury SKU say:

- Private keys for A005/X002 **never** reside outside the HSM.
- Sign operations execute **inside** the device (PKCS#11 `C_Sign`), never via
  software RSA on the JVM heap.

`Pkcs11A005Signer.sign(byte[])` already guarantees that on our side. The gap is
that the upstream library short-circuits us: it calls
`KeyUtil.makeKeyPair(...)` in `CertificateManager.createA005Certificate(...)`,
gets a heap-resident `PrivateKey`, hands it to `User.setA005PrivateKey(...)`,
then later signs via `Signature.getInstance("SHA256withRSA").initSign(privKey)`
against that heap key. We never get a chance to substitute.

## Upstream surface — what exists today

Upstream HEAD (`com.github.ebics-java:ebics-java-client`, branch `master`):

| Class | Path | Role |
| --- | --- | --- |
| `EbicsClient` | `client/EbicsClient.java` | Public facade. `createUser(...)` (no key-injection overload), `loadUser(...)`, `sendINIRequest`, `sendHIARequest`, `sendHPBRequest`. |
| `User` | `client/User.java` | Subscriber record. Has package-private `setA005PrivateKey/setA005Certificate` (and X002/E002 pairs). Constructor (lines ~75–90) takes no key parameters; key-generation is triggered downstream. |
| `CertificateManager` | `certificate/CertificateManager.java` | The actual generator. `create()` (lines ~60–67) calls `createA005Certificate(...)`, `createX002Certificate(...)`, `createE002Certificate(...)` → each invokes `KeyUtil.makeKeyPair(resolveKeyLength())` and assigns the pair to the user via `setUserCertificates(...)`. `save()` (lines ~127–131) writes PKCS#12 to `<userDir>/<userId>.p12`. |
| `KeyUtil` | `utils/KeyUtil.java` | `makeKeyPair(int bits)` — `KeyPairGenerator.getInstance("RSA")` on the JCE default provider. |

**There is no public seam.** `CertificateManager` is not behind an interface;
`User.setA005PrivateKey(...)` is package-private; `EbicsClient.createUser(...)`
unconditionally runs the generator path.

## Local surface — what ORA-2309 shipped

Files under `services/ebics-sidecar-java/src/main/java/com/orangeocto/ebics/keystore/`:

- `KeyStoreLocator` — sealed interface; `dir()`, `password()`, `signerFor(role)`.
- `FileKeyStoreLocator` — preserves the PoC PKCS#12-on-disk path (`EBICS_KEYSTORE_BACKEND=file`).
- `AwsCloudHsmKeyStoreLocator` — `Provider.configure("--name OctoCloudHsm --library /opt/cloudhsm/lib/libcloudhsm_pkcs11.so --slot ...")`, slot pinned to `eu-central-1`. `CKA_SENSITIVE=true / CKA_EXTRACTABLE=false` enforced.
- `SmartcardKeyStoreLocator` — `Provider.configure("--library /usr/lib/x86_64-linux-gnu/opensc-pkcs11.so --slot ...")`. Pro-tier fallback.
- `Pkcs11A005Signer` — JCE `SHA256withRSA` via the SunPKCS11 provider. `sign(byte[])` does on-token signing. Asserts `privateKey.getEncoded() == null` (defense-in-depth — a non-null encoding means the key escaped the token, which would mean a misconfigured `CKA_EXTRACTABLE`).

`RealEbicsClientFacade.client()` currently has:

```java
if (!(keystore instanceof FileKeyStoreLocator)) {
    throw new IllegalStateException(
        "EBICS_KEYSTORE_BACKEND=" + keystore.backendName() +
        " not yet wired into upstream ebics-java-client. See ORA-2311.");
}
```

This guard is what ORA-2311 removes once the upstream SPI lands.

## Closing the gap

Two routes; either resolves the issue:

1. **Upstream PR** — additive `EbicsClient.createUser(...)` overload that takes
   six `(PrivateKey, X509Certificate)` parameters and bypasses
   `CertificateManager.create()`. Design + draft patch:
   [`UPSTREAM_HSM_SPI_PROPOSAL.md`](./UPSTREAM_HSM_SPI_PROPOSAL.md).

2. **Fork to `com.orangeocto:ebics-java-client-hsm`** (JitPack-published) —
   applies the same patch on a maintained fork if upstream is unresponsive >4
   weeks. Branch policy + JitPack release flow also in the proposal doc.

## How verification will look once the gap closes

`hsm-smoke` profile already provisions SoftHSMv2 in CI. The follow-on test —
new in this ticket once we consume the patched library — will:

1. `softhsm2-util --init-token ... --label ebics-a005-test`.
2. `genrsa --label ebics-a005-test` on-token via PKCS#11.
3. Build a self-signed X.509 over the on-token public key.
4. Call the new `EbicsClient.createUserWithExternalKeys(...)` overload with the
   `(Pkcs11PrivateKey, Certificate)` triples.
5. Drive INI/HIA against the Libeufin mock (or our in-house mock with
   `app.ebicsBankMode=mock`).
6. Assert `<File system trace>/keystore/` contains **no** `*.p12` for the
   test subscriber — i.e. the heap-key fallback never executed.

The assertion in step 6 is the DSGVO-load-bearing check. Without it, "HSM
works" could quietly degrade to "HSM works AND a duplicate heap key was also
created somewhere".
