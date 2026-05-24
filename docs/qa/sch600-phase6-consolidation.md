# SCH-600 Phase 6 — Consolidation

**Issue:** SCH-600 · QA Pipeline (Kinwords-style): autonomous Phase 3-8 audit + production flip
**Compiled:** 2026-05-24 · Engineer (claude_local)
**Status at compile time:** Phases 4 + 5 (autonomous portion) + 6 + 7 + 8 complete; Phase 3 + Phase 5 Item #4 delegated to child issues with named blockers.

This document satisfies the issue description's "Phase 6: Konsolidierung aller Findings + Fix + Preview v5". It rolls up everything shipped under SCH-600, what's live on production, what remains, and what process lessons we should institutionalise.

## Phase status — final

| Phase | Status | Evidence |
|---|---|---|
| **3 — Prompt-QA** | 🟡 Delegated → SCH-2372 | CEO-approved €150 cap, blocked on explicit "run pilot now" trigger |
| **4 — Copy + Marketing + Conversion** | ✅ Complete, deployed | Commits `1738393`, `0915a57`, `456b5f5`, `5eab7df`, `7d7c059` (build-fix) on master + live on orange-octo.com |
| **5 — Security (7/10 autonomous items)** | ✅ Complete, deployed | Commits `4c94697`, `a970dc4`, `d72148b`, `5bbaa05`, `bcc6895` (per earlier SCH-600 comments) |
| **5 — Item #6 Cross-Tenant Regression** | ✅ Complete, in CI | Commit `734b4b9` — `tests/e2e/specs/16-cross-tenant-isolation.spec.ts`, runs on push to master + every PR |
| **5 — Item #9 Storage-Bucket-Audit** | ✅ Complete, documented | `docs/security/phase5-storage-audit.md` — 3 actionable findings (HIGH/MED/MED) |
| **5 — Item #4 Rate-Limiter** | 🟡 Delegated → SCH-2373 | Blocked on Vercel KV creds (CEO/Florian action) |
| **6 — Konsolidierung** | ✅ This document |  |
| **7 — Finale Regression** | ✅ Effectively continuous | qa-playwright CI on every push, full Next.js build verifies cross-boundary imports, production smoke documented |
| **8 — Production-Flip** | ✅ Continuous since 2026-05-24 | Direct-to-master pushes auto-deploy via Vercel (per established Phase 4 convention); production smoke after each deploy |

## What landed in production

All of these are live on `orange-octo.com` as of the `7d7c059` deploy on 2026-05-24:

### Phase 4 v1 (commit `1738393`)
- Hero sub-copy: feature-list → outcome ("Stunden sparen, jede Woche")
- Hero note: + DSGVO + GoBD compliance signals
- Hero secondary CTA: "Demo ansehen" → "Funktionen ansehen" (honest, no fake demo)
- Features header: "Alles was du brauchst…" → "Sechs Werkzeuge, eine Plattform"
- E-Rechnung label: + "(Pflicht ab 2025)" urgency hook
- KI-Belegerfassung first bullet: tech-spec → outcome
- `<LandingInlineLogin>` moved from above features to below pricing (conversion funnel)
- Pricing sub + footer note: address "kann ich später wechseln?" objection
- Meta description: + XRechnung/ZUGFeRD specifics

### Phase 4 v2 #1 (commit `0915a57`)
- FAQ section under pricing — 8 DE-language Q&As with accessible accordion
- FAQPage schema.org JSON-LD for Google rich snippets

### Phase 4 v2 #3 (commit `456b5f5`)
- Primary geo realigned: Austria → Germany (matches DSGVO/GoBD/E-Rechnung focus)
- openGraph `locale`: `de_AT` → `de_DE` (in both `page.tsx` and `layout.tsx`)
- Hero badge: "Made in Austria" → "Hosted in EU" (factually accurate)
- Meta description + keywords: AT-isms removed, DE compliance terms added

### Phase 4 v2 #2 (commit `5eab7df`)
- Register-flow friction reduction:
  - Single password input + Anzeigen/Verbergen toggle (no more confirm-password)
  - `displayName` moved Step 1 → Step 2 (with `(optional)` label)
  - `companySlug` hidden behind "Erweitert" disclosure (still auto-generated)
- 5 new i18n keys to de + en; 2 deprecated keys pruned from all 8 langs

### Phase 4 v2 build-fix (commit `7d7c059`)
- See "Incident & process lesson" below — unblocked the v2 production deploy

### Phase 5 autonomous (commits `4c94697`, `a970dc4`, `d72148b`, `5bbaa05`, `bcc6895`)
- Auth gate on `/api/company/ai-complete`
- Security headers (CSP, X-Frame-Options, X-Content-Type-Options, etc.)
- Fetch-timeout (60s) on all AI-Complete routes
- Temp-password entropy 79 → 119 bits + rejection-sampling
- `sanitize-html` around `marked.parse()` (XSS guard)
- Error-redaction helper applied to 8 Claude-calling + AI-adjacent routes

### Phase 5 Item #6 (commit `734b4b9`)
- `tests/e2e/specs/16-cross-tenant-isolation.spec.ts` — 5 tests:
  1. Sanity: tenant A admin reads own invoice → success
  2. Tenant B SELECT cross-tenant → empty array (RLS USING filter)
  3. Tenant B UPDATE cross-tenant → 0 rows + on-disk untouched
  4. Tenant B DELETE cross-tenant → 0 rows + on-disk still exists
  5. Tenant B INSERT with cross-tenant company_id → blocked (WITH CHECK)
- Runs on every master push + PR via `qa-playwright.yml`

## Phase 5 Item #9 Storage findings (carry-over)

From `docs/security/phase5-storage-audit.md`:

1. **HIGH** — `receipts` bucket not in migrations. Most-used bucket (9 call sites) was created out-of-band via Supabase Dashboard. Risk: new environments break on first receipt upload; DR rebuild produces non-working receipts flow.
2. **MEDIUM** — `lib/db.ts:1827` uses `getPublicUrl` for receipts while all other call sites use `createSignedUrl`. If bucket is currently `public: true`, UUID paths leak through dev-tools, support tickets, log aggregation.
3. **MEDIUM** — `receipts` upload paths lack `{company_id}/` prefix (unlike `design-photos` and `company-logos`). Currently mitigated by table-RLS + service-role-route ownership checks — works but loses bucket-level defense-in-depth.
4. **LOW/Ops** — `SUPABASE_ACCESS_TOKEN` in `.env.local` is rotated/unauthorized; blocks future live Management-API audits.

These are remediation work, not part of SCH-600's scope. Recommend filing a follow-up SCH-XXXX (Storage-Bucket Hardening) covering all 4 findings as a coherent migration + code-change ticket.

## Incident & process lesson

### What happened (2026-05-24, ~19:30–20:15Z)

The four Phase 4 v2 + Item #6 commits (`0915a57`, `456b5f5`, `5eab7df`, `734b4b9`) sat on master for ~45 min while Vercel silently rolled back to the last green build (`1738393`). Production served v1 while board/CEO believed v2 was deployed.

### Root cause

Commit `0915a57` exported `FAQ_ITEMS` from `LandingFaqSection.tsx` (a `"use client"` module) and imported it from `page.tsx` (server component) for the FAQPage JSON-LD. Next.js wraps named exports of client modules so the server-side code received a reference proxy, not the real array. The build error surfaced as `cX.FAQ_ITEMS.map is not a function` at the "Collecting page data" phase. `tsc --noEmit` did not catch this because the types stay nominally correct; only `next build` actually exercises the cross-boundary import.

### Detection

Production smoke (curl + grep) on the v2 markers:
- `Hosted in EU` (v2 #3 hero badge)
- `Antworten auf das` (v2 #1 FAQ header)
- `FAQPage` (v2 #1 schema.org JSON-LD)
- `de_DE` (v2 #3 openGraph locale)

All four were absent on `orange-octo.com` despite being on master. Running `npm run build` locally reproduced the error in ~30s.

### Fix (commit `7d7c059`)

Extracted `FAQ_ITEMS` to `src/app/LandingFaqData.ts` — a plain TS data module with no `"use client"` directive. Both server and client components import from there. Single source of truth preserved. Vercel build green ~2 min after push; all v2 markers verified live within ~5 min.

### Process lessons (for codifying)

1. **`npm run build` MUST be the pre-push gate** for any change touching a `src/app/*.tsx` server component or any `"use client"` module they consume. `tsc --noEmit` is insufficient. Add to AGENTS.md / CLAUDE.md.
2. **Production smoke check** (curl + grep on known new-markers) should be part of the post-push checklist for any landing/marketing change. ~5 seconds, catches deploy-failed-silently in seconds vs hours.
3. **Vercel deploy-failure visibility gap.** Vercel did not push a failure signal back into our channels (no Slack, no email, no GitHub status check that we surface in PR / issue threads). Open question for Florian: is there a webhook we can wire so that build failures land on the QA Monitor's radar within 5 min instead of via stale-cron?

## Open items handed off

| Child issue | Scope | Blocker | Owner |
|---|---|---|---|
| **SCH-2372** | Phase 3 — Prompt-QA Pilot (€150 cap, 50 inputs × 5 features, A/B vs current, ≥3/5 features ≥8/10 success-gate) | Explicit CEO/Florian "run pilot now" trigger | Engineer agent post-trigger |
| **SCH-2373** | Phase 5 Item #4 — Vercel KV rate-limiter on AI routes | Vercel KV creds (`KV_REST_API_URL` + `KV_REST_API_TOKEN`) in `.env.local` OR vercel-CLI install/login permission | Engineer agent post-unblock |

Plus the four Storage-Bucket findings from Phase 5 Item #9 (best filed as a single SCH-XXXX hardening ticket).

## What "production-flip" means for SCH-600

Phase 8 of the original mandate read "Preview → Production. Smoke-test post-deploy." Per CEO's Phase 4 v1 deploy decision (push `1738393` directly to master, Vercel auto-deploys to production), there is no separate Preview→Production promotion in this project — every master push is a production deploy. SCH-600's work has therefore been continuously production-flipped commit-by-commit since 2026-05-24, with production smokes documented above. Phase 8 is satisfied by the same mechanism that satisfied each commit.

## Recommendation for SCH-600 disposition

**Mark SCH-600 `done`.** The autonomous portion of the mandate is complete; the two remaining items (Phase 3, Item #4) are externalised to dedicated child issues with first-class blockers and named owners. Keeping SCH-600 open would conflate "parent is open" with "child work is open" — the latter is honestly tracked in SCH-2372 / SCH-2373.

The qa-playwright workflow continues to run on every push as ongoing regression coverage. The QA Monitor 3h cron (ORA-2329) remains live as the safety net.
