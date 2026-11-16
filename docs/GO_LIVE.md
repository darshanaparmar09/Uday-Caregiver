# Go live checklist

What is built, and what must be finished or connected before real families and real money. Owners: Uday (U), agency (A), counsel or CA (L).

## Built and tested

- Phone OTP sign in with rate limits and attempt limits; sessions revocable; cookie for web, secure storage token for the app.
- Family onboarding: payer profile, senior profile, care needs, two emergency contacts minimum, consent with on behalf flag. Health details and Aadhaar optional.
- Optional health profile, field encrypted, versioned, every view audited; caregiver sees only consented parts, only while booked.
- Booking engine: fees in paise, hold then capture, offer window, decline or timeout cascade to a same tier caregiver with family approval, release when none, cancel and reschedule with the 4 hour rule, multi day shifts, start and end codes, shift log required before ending, rating with low rating follow up, help requests with service levels, double entry ledger per shift.
- Daily check in for seniors (app) and for families on their behalf; missed check in alerts by scheduler; SOS for seniors and caregivers.
- Caregiver app, five tabs: Jobs (online status, offers with countdown and urgent push alert, accept or decline, substitute on cancel, travel and arrival with geofence, codes, shift log that works offline, SOS), Days (availability and leave), Pay (balance, weekly payouts, history), Learn (academy modules with quizzes, tier progress), Me (15 step onboarding, identity, documents, contract, bank, ratings and coaching).
- Ops queues: convert Careers applications, clear onboarding steps (police result only), approve leave, run weekly payouts.
- Website: ten public pages, hire flow, family dashboard, booking view, onboarding, health form, careers applications, operations board.
- Security: field encryption with separate keys, hashed lookups, append only events, ledger and audit tables, security headers, no card data, no Aadhaar numbers, no police reports stored.

- Care facilities: directory, profile, visit requests, visit checklist, reviews after a completed visit, facility self onboarding with a monthly plan, ops approval, renewals (`/api/cron?job=renewals`, run daily).
- Care need picker (18 needs, 7 groups) and home commitments per care type, stored with a version.
- Five area caregiver ratings, averaged; a rating is required before rehiring the same caregiver.
- Readings from caregivers, families and devices in one encrypted stream; wearable connections.

## Must be connected before launch

| Item | Owner | Where |
| --- | --- | --- |
| Payment gateway: finish `RazorpayGateway` (checkout, payment.authorized webhook route, capture, refund, Route split payouts) or the chosen gateway | A, U | `apps/web/lib/payments.ts` |
| SMS or WhatsApp OTP provider | A | `apps/web/lib/notify.ts` `sendOtp` |
| Push notifications (Expo push tokens table and sender), WhatsApp templates for alerts | A | `lib/notify.ts`, mobile app |
| KYC partner call in `lib/kyc.ts`; police verification provider results entered in ops (result only) | A, U | `lib/kyc.ts`, `/ops` |
| Payout provider (RazorpayX or chosen gateway) for real bank transfers; schedule `POST /api/cron?job=payouts` every Monday | A | `lib/payments.ts` payout |
| S3 driver for encrypted documents in an Indian region bucket | A | `lib/storage.ts` |
| EAS project id in `apps/mobile/app.json`, `PUSH_PROVIDER=expo` and `EXPO_ACCESS_TOKEN` | A | push |
| Clinical review of academy module content | U | `db/migrations/004_academy_content.sql` |
| GST invoices as PDF with GSTIN | A, L | after CA confirms tax treatment |
| Document upload (prescriptions) to encrypted object storage | A | `health_documents` table exists |
| Real caregivers replace seed data; real rates replace samples | U | `db/seed.mts` |
| Privacy policy, terms, caregiver contract | L | `/legal` page placeholder |
| Penetration test and DPDP review | A, L | before launch |
| App store listings, icons, splash artwork | U, A | `apps/mobile/app.json` |
| Domain, TLS, monitoring and alerting | A | hosting |

- Facility plans: create Listed and Featured monthly plans in Razorpay and set `RAZORPAY_PLAN_LISTED`, `RAZORPAY_PLAN_FEATURED`.
- Health devices: add `react-native-health` (iPhone) and `react-native-health-connect` (Android) in a development build, then implement `readStore()` in `packages/mobile-shared/src/health.ts`. Confirm sync support for Garmin, Amazfit, Noise, boAt, Omron and Withings.
- Withings: register an API app and implement the account link in `lib/readings.ts` `connect()`.

## Working assumptions to confirm

8% platform fee, 18% GST on platform fee, offer window 30 minutes same day and 4 hours for later starts, 150 metre geofence, check in expected by 10 AM with alert after 11 AM, sample caregiver rates. All are in `packages/core` POLICY or environment variables.
- Facility plan prices: ₹4,999 and ₹9,999 a month plus GST.
- Home commitment wording, including live in breaks (2 hours day, 8 hours night) and a weekly day off with relief cover: check with your lawyer.
- Facility licence check: ops confirms the licence with the issuing authority before a listing goes live.
