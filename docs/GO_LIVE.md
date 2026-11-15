# Go live checklist

What is built, and what must be finished or connected before real families and real money. Owners: Uday (U), agency (A), counsel or CA (L).

## Built and tested

- Phone OTP sign in with rate limits and attempt limits; sessions revocable; cookie for web, secure storage token for the app.
- Family onboarding: payer profile, senior profile, care needs, two emergency contacts minimum, consent with on behalf flag. Health details and Aadhaar optional.
- Optional health profile, field encrypted, versioned, every view audited; caregiver sees only consented parts, only while booked.
- Booking engine: fees in paise, hold then capture, offer window, decline or timeout cascade to a same tier caregiver with family approval, release when none, cancel and reschedule with the 4 hour rule, multi day shifts, start and end codes, shift log required before ending, rating with low rating follow up, help requests with service levels, double entry ledger per shift.
- Daily check in for seniors (app) and for families on their behalf; missed check in alerts by scheduler; SOS for seniors and caregivers.
- Caregiver app: online status, offers with countdown, accept or decline with reason, cancel with substitute, location at travel and arrival with geofence, codes, log, earnings.
- Website: ten public pages, hire flow, family dashboard, booking view, onboarding, health form, careers applications, operations board.
- Security: field encryption with separate keys, hashed lookups, append only events, ledger and audit tables, security headers, no card data, no Aadhaar numbers, no police reports stored.

## Must be connected before launch

| Item | Owner | Where |
| --- | --- | --- |
| Payment gateway: finish `RazorpayGateway` (checkout, payment.authorized webhook route, capture, refund, Route split payouts) or the chosen gateway | A, U | `apps/web/lib/payments.ts` |
| SMS or WhatsApp OTP provider | A | `apps/web/lib/notify.ts` `sendOtp` |
| Push notifications (Expo push tokens table and sender), WhatsApp templates for alerts | A | `lib/notify.ts`, mobile app |
| KYC partner for caregiver identity; police verification provider results into `caregiver_verifications` | A, U | ops tooling |
| Caregiver onboarding stages 1 to 15 as ops screens (currently seeded) | A | Onboarding Specification |
| Weekly payout job from `ledger_entries` per caregiver | A | finance |
| GST invoices as PDF with GSTIN | A, L | after CA confirms tax treatment |
| Document upload (prescriptions) to encrypted object storage | A | `health_documents` table exists |
| Real caregivers replace seed data; real rates replace samples | U | `db/seed.mts` |
| Privacy policy, terms, caregiver contract | L | `/legal` page placeholder |
| Penetration test and DPDP review | A, L | before launch |
| App store listings, icons, splash artwork | U, A | `apps/mobile/app.json` |
| Domain, TLS, monitoring and alerting | A | hosting |

## Working assumptions to confirm

8% platform fee, 18% GST on platform fee, offer window 30 minutes same day and 4 hours for later starts, 150 metre geofence, check in expected by 10 AM with alert after 11 AM, sample caregiver rates. All are in `packages/core` POLICY or environment variables.
