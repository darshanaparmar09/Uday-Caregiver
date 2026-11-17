# Uday readiness sprint, Phase 1: technical assessment and issue register

Branch: `readiness-sprint` (not merged, not deployed). Date: 17 November 2026.
Method: four independent audits (security and privacy, care reliability, architecture, store readiness), consolidated below. Every item marked **Fixed** has code on the branch and an automated test, or a manual check named in the Evidence column. Test suite: **55 of 55 pass** against a fresh build.

## 1. Assessment in brief

**What was sound:** the booking state machine, field level encryption of health and identity data, the caregiver onboarding pipeline, GST invoicing, and the operations console. These were kept, not rebuilt.

**What was unsafe for an elder care product:**
1. Safety signals did not reach people. SOS created a database row and alerted nobody. Every message was recorded as "queued" whether or not it was sent. No alert waited for acknowledgement, nothing escalated, and emergency contacts without the app were never told.
2. Test conveniences leaked toward production. The fixed sign in code worked on any non development server, and the Docker image would have shipped the developer `.env.local`.
3. Consent gaps. Any family could link any phone number as "parent" and see the senior's data. Caregivers saw home address and health details from acceptance until forever.
4. No account deletion or data export, which blocks both stores and Indian DPDP obligations.
5. Money paths that could double pay caregivers, refund against the wrong id, or mark Uday Plus active before payment.
6. Both mobile apps are on Expo SDK 52, which neither store now accepts.

**Where it stands now:** items 1 to 5 are fixed and tested. Item 6 is the main remaining release blocker and needs a device test cycle (section 4).

## 2. Ranked issue register

Severity: **C** Critical, **H** High, **M** Medium, **L** Low. Source audit: SEC security, REL care reliability, ARC architecture, STO store.

### Critical

| # | Issue | Source | Status | Evidence |
|---|---|---|---|---|
| C1 | SOS alerted nobody; senior was told help was coming | REL C1 | **Fixed** | New alert engine: SOS reaches family, emergency contacts by SMS, on call phones; opens a critical incident. Test `SOS tells the truth` |
| C2 | Message status always "queued"; apps showed success before the server answered | REL C2, C3 | **Fixed** | `notify()` returns sent, simulated, failed or no_channel and stores it; apps wait for the server. Tests assert `simulated`, never `sent`, in test mode |
| C3 | No acknowledgement or escalation; emergency contacts never alerted | REL C4, C5 | **Fixed** | Alerts stay open until a named person responds (app or SMS link `/a/...`); timed escalation to all contacts plus urgent help request. Test covers ack by link and escalation |
| C4 | Fixed OTP accepted outside development; Docker image bakes `.env.local` | SEC C1 | **Fixed** | `UDAY_ENV`; startup guard refuses unsafe config; `.dockerignore`. Manual check on staging server: fixed code 401, named tester 200, guard refuses start |
| C5 | Shift codes guessable, no attempt limit | SEC C2 | **Fixed** | Crypto random codes, 5 wrong tries lock 15 min and alert ops. Test `shift codes lock` |
| C6 | No production file storage (local disk only) | ARC C1 | **Fixed, not live tested** | S3 driver with signer verified against the AWS documented example. Needs one run against a real bucket |
| C7 | Refund used order id; repriced approval inserted a held payment with no checkout | ARC C2 | **Partly fixed** | Refund uses payment id. Extension and reprice paths still need live Razorpay verification (open) |
| C8 | Family mobile app cannot pay on a live gateway (ignores checkout) | ARC C3 | **Open** | Needs Razorpay React Native SDK and a device; see section 4 |
| C9 | Expo SDK 52 rejected by both stores | STO | **Open, blocker** | Section 4 |
| C10 | No account deletion | STO, SEC H4 | **Fixed** | In app (all apps), web My account, public `/delete-account`. Test `your data` |

### High

| # | Issue | Source | Status | Evidence |
|---|---|---|---|---|
| H1 | Family could link any phone as parent | SEC H1 | **Fixed** | Senior must accept the link; test `a parent must agree` |
| H2 | Uday Plus active before payment, never expired | SEC H2 | **Fixed** | Pending until webhook confirms; period end enforced |
| H3 | OTP attempts racy, no IP limit | SEC H3 | **Fixed** | Atomic counter, hourly cap, per IP limit; test `sign in` |
| H4 | No data export, consent withdrawal | SEC H4 | **Fixed** | `/api/me/export`, consent endpoint, web "Your data" panel; withdrawal hides health data at once (tested) |
| H5 | Community open to self declared seniors | SEC H5 | **Fixed** | Confirmed family link required |
| H6 | Seniors without a phone unmonitored | REL H1 | **Fixed** | Missed check in sweep covers call mode |
| H7 | Scheduler a single point of failure, silent | REL H2, ARC H5 | **Fixed** | Advisory locks, heartbeat per job, `/api/health` turns 503 when a critical job is stale; test |
| H8 | No show text promised "Uday is calling her now" | REL H3 | **Fixed** | Wording states only what happens |
| H9 | Medicines inferred from a checklist tick; shift could end with tasks silently undone | REL H4 | **Fixed** | Meal and medicines recorded only when stated; unmarked tasks listed to family at shift end. Test `care logs` |
| H10 | Offline queue lost or duplicated logs | REL H6 | **Fixed** | Operation ids, server idempotency (`X-Client-Op`); test sends twice, stores once |
| H11 | Removed caregiver kept access and cached data | REL H7 | **Fixed** | Sessions revoked, cache wiped on 401/403, urgent tickets for live care |
| H12 | Caregiver saw address and health data indefinitely | SEC M3 | **Fixed** | Care window (24 h before first shift to end of care); health reads audited |
| H13 | Payout could pay twice | REL M5 | **Fixed** | Lock and intent row before the gateway call |
| H14 | Double booking possible | ARC H2 | **Fixed** | Availability rechecked under lock at acceptance; test |
| H15 | No fetch timeouts; mobile token cleared on any error | ARC H4, H9 | **Fixed** | 20 s client and provider timeouts; sign out only on 401/403 |
| H16 | Dashboard query bug (`p.hidden`) | ARC H8 | **Fixed** | |
| H17 | npm audit: next 14.2.35 critical, zod high | ARC H7 | **Open** | Needs Next 15 upgrade and regression pass (section 4) |
| H18 | No observability or backup runbook | ARC H6, SEC M8 | **Partly fixed** | Health endpoint and cron heartbeat done. Error tracking and backup restore drill open |
| H19 | Community lacked block user, report user, rules acceptance | STO | **Fixed** | Rules before joining or posting; block hides both ways; report blocks at once and reaches Operations. Test `store safety` |
| H20 | AI companion had no consent, AI label or flag button | STO | **Fixed** | Consent screen (not a person, not a doctor, data goes to Anthropic, 30 day retention), label on every reply, report button, Operations review queue showing only the AI reply. Test `store safety` |

### Medium and Low (summary)

| # | Issue | Status |
|---|---|---|
| M1 | Audit gaps (coupons, photo checks, relief cover, facility approval, leads, onboarding stages, applications, leave) | **Fixed**; coupons moved to admin only. Test `coupons are admin only and audited` |
| M2 | CSV formula injection in exports | **Fixed** |
| M3 | Cron and IVR secrets compared unsafely; IVR result unsigned | **Fixed** (timing safe compare, signed one time IVR refs) |
| M4 | Open redirect on sign in | **Fixed** |
| M5 | No CSP, body size limit, cross site check | **Fixed** |
| M6 | Alerts sent inside the database transaction (should use an outbox) | **Open** |
| M7 | Plaintext lat/lng, contact names, notes, messages, email; mobile cache unencrypted | **Open** |
| M8 | `VITALS_LIMITS` are unreviewed clinical thresholds | **Open: needs a clinician.** Wording already says "not a medical assessment". No new clinical logic was added |
| M9 | Handover notes (table exists, feature not built) | **Open** |
| M10 | `.env.example` drift | **Fixed** |
| M11 | WhatsApp templates need Meta approval | **Open (owner)** |
| L1 to L8 | Sessions list, Daily rooms public, KYC base URL, OTP text 10 vs 5 min (fixed), push token takeover, quiz answers, two report threshold (now hidden for reporter at once) | Mixed; see audit notes |

## 3. Changes made (where to look)

* Alert engine: `apps/web/lib/alerts.ts`, routes under `app/api/alerts`, page `app/a/[token]`, banners in web, family app, senior app, Operations live view.
* Truthful messaging: `lib/notify.ts`, `lib/push.ts`, `lib/providers.ts`.
* Environments and guard: `lib/env.ts`, `instrumentation.ts`, `.dockerignore`, `next.config.mjs` headers, `middleware.ts`.
* Scheduler: `lib/cron.ts`, `lib/db.ts` (`withLock`), `app/api/health`.
* Privacy: `lib/account.ts` (export, delete, consent, sign out everywhere), `components/forms/YourData.tsx`, `app/(site)/delete-account`, mobile `AccountData.tsx`.
* Community and AI: `lib/senior.ts` (rules, block, report), `lib/family.ts` (companion consent and flags), mobile `Community.tsx`, `Companion.tsx`, Operations queue in `OpsQueues.tsx`.
* Store config: both `app.json` files, both `eas.json`, new icons and splash in each app's `assets`.
* Database: migrations 013, 014, 015 (applied to the development database only).
* Tests: `apps/web/test/hardening.test.ts` (10 tests) plus updates to existing suites.

## 4. Could not be completed safely in this sprint

| Item | Why not now | What it needs |
|---|---|---|
| Expo SDK 52 to 54 or later (store blocker on both stores) | Native upgrade changes React Native, health libraries and build tooling; cannot be verified without real iOS and Android builds | 2 to 3 days: upgrade, EAS builds, test on one iPhone and one Android phone (health sync, push, offline, SOS) |
| In app payment on mobile (C8) | Needs Razorpay native SDK and a device | Build with SDK upgrade |
| Next.js 15 upgrade (npm audit critical) | Framework upgrade touches every page; needs a full regression pass | 1 day plus regression |
| Razorpay extension and reprice paths, live refunds | Needs live test keys and sandbox webhooks | Razorpay test account session |
| Transactional outbox for notifications | Design change across all senders | 1 to 2 days |
| Encrypting remaining plaintext fields and mobile cache | Data migration on encrypted columns | 1 day plus migration rehearsal |
| Clinical review of vitals thresholds | Clinical decision; out of scope by instruction | A named clinical advisor |
| Voice call escalation for unacknowledged SOS | Needs Exotel account and approved flow | Exotel account |
| S3 live test, KYC partner live test | Needs accounts | Credentials in Operations, Settings |
| Privacy policy and terms on `/legal` | Legal text needs counsel approval | Counsel; store submission needs it live |
| Ops tool to delete an account on a verified request (promised on `/delete-account` for people who cannot sign in) | Not built | Half a day |
| Hindi and Marathi for new strings | Needs native speaker | Reviewer; new strings fall back to English |
| Icons and splash | Placeholders made from brand colours | A designer |
