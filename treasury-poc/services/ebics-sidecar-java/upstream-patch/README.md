# Upstream `ebics-java-client` HSM SPI patch — Treasury Engineer handoff

This directory ships a single `git format-patch` artefact that
implements the `ExternalKeyProvider` SPI described in
[`../docs/UPSTREAM_HSM_SPI_PROPOSAL.md`](../docs/UPSTREAM_HSM_SPI_PROPOSAL.md).

The patch is **not yet upstream**. It is staged here for the CEO to apply
to an Orange-Octo fork of
[`github.com/ebics-java/ebics-java-client`](https://github.com/ebics-java/ebics-java-client)
and submit as a pull request.

## What the patch does

| File | Change | Why |
| --- | --- | --- |
| `src/main/java/org/kopi/ebics/client/ExternalKeyProvider.java` | **new** — SPI interface + `KeyMaterial` value type | Lets callers install A005/X002/E002 (`PrivateKey`, `X509Certificate`) tuples instead of having the library generate them. |
| `src/main/java/org/kopi/ebics/client/User.java` | new constructor `User(..., ExternalKeyProvider externalKeys)` | Bypasses `createUserCertificates()` → `CertificateManager.create()` → `KeyUtil.makeKeyPair()`. |
| `src/main/java/org/kopi/ebics/client/User.java` | `saveUserCertificates()` no-ops when `manager == null` | External keys live in the HSM; the library MUST NOT mirror them to disk. |
| `src/main/java/org/kopi/ebics/client/User.java` | `sign()` / `authenticate()` / `decrypt()` route via `newSignature(algo, key)` / `providerOf(key)` | Hardcoded `BouncyCastleProvider.PROVIDER_NAME` rejects SunPKCS11 PrivateKeys with `InvalidKeyException`. Patch routes the JCE Signature/Cipher to the key's own provider when it's SunPKCS11; falls back to BouncyCastle for legacy software keys (zero regression on PKCS#12 flow). |
| `src/main/java/org/kopi/ebics/client/EbicsClient.java` | new `createUser(..., ExternalKeyProvider)` overload | Public entry point for HSM-backed subscribers. Skips `saveUserCertificates()` entirely — letters still get written (public-key hashes only). |
| `src/test/java/org/kopi/ebics/client/ExternalKeyProviderTest.java` | **new** — JUnit 5 suite | Guards (`KeyMaterial` nulls, null provider), new `User` constructor wiring, and signature round-trip via the BouncyCastle fallback (proves no regression on the legacy in-process flow). |

Diffstat: 4 files changed, 428 insertions(+), 6 deletions(-).

## How CEO applies it

```bash
# 1. Fork github.com/ebics-java/ebics-java-client into the Orange-Octo org.
gh repo fork ebics-java/ebics-java-client --org orange-octo --clone
cd ebics-java-client

# 2. Cut a branch.
git checkout -b feature/hsm-spi-v1 origin/master

# 3. Apply the patch (preserves authorship + message verbatim).
git am < /path/to/this-repo/treasury-poc/services/ebics-sidecar-java/upstream-patch/0001-feat-client-ExternalKeyProvider-SPI-for-HSM-backed-s.patch

# 4. (Optional but recommended) run the tests.
./mvnw test -Dtest=ExternalKeyProviderTest

# 5. Push.
git push -u origin feature/hsm-spi-v1

# 6. Open the upstream PR.
gh pr create --repo ebics-java/ebics-java-client \
    --head orange-octo:feature/hsm-spi-v1 \
    --title "feat(client): ExternalKeyProvider SPI for HSM-backed subscribers" \
    --body "$(awk 'NR>1' /path/to/this-repo/treasury-poc/services/ebics-sidecar-java/docs/UPSTREAM_HSM_SPI_PROPOSAL.md)"
```

## Verification status

| Check | Status |
| --- | --- |
| Patch builds against `ebics-java-client` master @ `c09a1ae` | **Not yet run in this environment** — no JDK in the Treasury Engineer's sandbox. Patch is syntactically self-consistent (`git format-patch` against a fresh clone; no merge conflicts on `master`). |
| `mvn test -Dtest=ExternalKeyProviderTest` | **Pending** — run by CEO on the fork before submitting. |
| Behavioural compatibility with legacy in-process keystore flow | Asserted by `user_sign_with_external_software_key_routes_through_bouncycastle` — falls through to `BouncyCastleProvider.PROVIDER_NAME` for any non-PKCS#11 key. |
| HSM round-trip (SunPKCS11 → on-token signing) | Out of scope for the upstream PR. The sidecar consumer side has `SoftHsmA005SigningTest` (ORA-2309 `services/ebics-sidecar-java/src/test/java/com/orangeocto/ebics/keystore/`) that covers it end-to-end. |

## If upstream rejects or stalls

Fork-fallback plan is in [`../docs/UPSTREAM_HSM_SPI_PROPOSAL.md`](../docs/UPSTREAM_HSM_SPI_PROPOSAL.md)
§"Fork fallback" — same patch, published as `com.orangeocto:ebics-java-client-hsm` via
JitPack. The patch in this directory is the same artefact either way.

## Re-running this handoff

If upstream comments require iteration:

1. Treasury Engineer regenerates the patch on the same branch in our
   local clone of upstream (or in a new Paperclip session against this
   repo).
2. Commit the regenerated `.patch` file in place. Filename stays
   `0001-feat-client-ExternalKeyProvider-SPI-for-HSM-backed-s.patch` so
   the README links don't rot.
3. CEO repeats steps 3–6 above (or `git am --abort && git am < new.patch`
   on the existing fork branch).
