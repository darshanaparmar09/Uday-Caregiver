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

- Senior mode restored from the first builds: four check in moods, home with streak and SOS, medicines taken, three brain games, interest groups, events, people nearby (opt in), cyber fraud and crime help, call back requests, check in reminder at the senior's chosen time.

- Care operations: live in days (start code day 1, daily close, end code last day), weekly day off with relief caregivers, weekly billing for monthly and quarterly care, Extend care, Ask for a different caregiver, no show alerts (cron), verified caregiver photos, public reviews, intro calls and trial days, senior sees today's caregiver.

## Must be connected before launch

Most services are now connected from the admin screen, **Operations, Settings** (`/ops/settings`), not from server files. Keys are stored encrypted (set `FIELD_KEY_SECRET` on the server). Each card has a **Test connection** button.

| Item | Owner | Where |
| --- | --- | --- |
| Business name, legal name, GSTIN, address, SAC code, GST rate, invoice prefix; tick "CA reviewed" after the CA signs off (invoices say DRAFT until then) | U, L | Settings, Business and GST |
| SMS: MSG91 for Indian numbers (DLT templates), Twilio for numbers abroad; choose the route | U | Settings, SMS and WhatsApp |
| WhatsApp: Meta Cloud API or Twilio; create the `uday_*` templates and get them approved | U | Settings, SMS and WhatsApp |
| Exotel: masked calls and the daily check in call flow (press 1 or 2, callback to `/api/ivr/checkin?token=IVR_TOKEN`) | U, A | Settings, Calls |
| Razorpay: live keys, webhook (`/api/payments/webhook`: payment.authorized, payment.captured, payment.failed), recurring payments enabled on the account for UPI AutoPay and cards, RazorpayX for payouts | U, A | Settings, Payments |
| Aadhaar checks: manual mode works now; for API mode sign a KYC partner and match its paths | U, A | Settings, Aadhaar check |
| Video for intro calls: Jitsi works with no account; Daily for a branded room | U | Settings, Video |
| Claude API key for Talk to Uday; safety review of the companion prompt | U, A | Settings, AI companion |
| Partners: telehealth, insurance and tablet partners uploaded from the Excel template | U | Settings, Partners |
| Push notifications: EAS project id in each `app.json`, `PUSH_PROVIDER=expo`, `EXPO_ACCESS_TOKEN` | A | server env |
| S3 driver for encrypted documents in an Indian region bucket | A | `lib/storage.ts` |
| Clinical review of academy module content | U | `db/migrations/004_academy_content.sql` |
| Native speaker review of Hindi and Marathi senior screens | U | `packages/mobile-shared/src/i18n.ts` |
| Real caregivers replace seed data; real rates replace samples | U | `db/seed.mts` |
| Privacy policy, terms, caregiver contract | L | `/legal` page placeholder |
| Penetration test and DPDP review | A, L | before launch |
| App store listings, icons, splash artwork | U, A | `apps/mobile/app.json` |
| Domain, TLS, monitoring and alerting | A | hosting |

- Facility plans: create Listed and Featured monthly plans in Razorpay and set `RAZORPAY_PLAN_LISTED`, `RAZORPAY_PLAN_FEATURED`.
- Withings: register an API app and implement the account link in `lib/readings.ts` `connect()`.

## Test build on a real phone (health sync and push)

Health sync and push cannot run in a browser or Expo Go. They need an installed build. The code and config are ready: `react-native-health` (iPhone) and `react-native-health-connect` (Android) are installed, permissions are in `apps/mobile/app.json`, and the readers in `apps/mobile/src/health` register at start. They have not yet run on a device.

1. **Put the server online** (staging). The phone app talks to the server; it cannot reach a laptop. Set the address in `apps/mobile/eas.json` (`EXPO_PUBLIC_API_URL`) for the `preview` profile.
2. **Create a free Expo account** at expo.dev, then on a computer: `npm i -g eas-cli`, `cd apps/mobile`, `eas login`, `eas init` (this writes the project id into `app.json`, which push needs).
3. **Android (easiest):** `eas build -p android --profile preview`. When it finishes (about 15 minutes) Expo shows a link and QR code. Open it on the Android phone and install the APK. Install Google's **Health Connect** app if the phone does not have it.
4. **iPhone:** needs an Apple Developer account (USD 99 a year). `eas device:create` to register the iPhone, then `eas build -p ios --profile preview`, and install from the link. HealthKit is switched on in the build.
5. **Test:** sign in as a senior, open Me, tap **Sync health readings**, allow access. Readings appear in the family's Readings page. For push, sign in as family on one phone and do a check in from the senior's phone.
6. Repeat 3 and 4 for `apps/caregiver` (push only).

## Working assumptions to confirm

8% platform fee, 18% GST on platform fee, offer window 30 minutes same day and 4 hours for later starts, 150 metre geofence, check in expected by 10 AM with alert after 11 AM, sample caregiver rates. All are in `packages/core` POLICY or environment variables.
- Facility plan prices: ₹4,999 and ₹9,999 a month plus GST.
- Home commitment wording, including live in breaks (2 hours day, 8 hours night) and a weekly day off with relief cover: check with your lawyer.
- Facility licence check: ops confirms the licence with the issuing authority before a listing goes live.
- Senior community: posts with phone numbers or links are blocked; two reports hide a post. Uday ops must review reported posts daily.
- Not built yet from the first prototype: AI companion chat, telehealth, insurance, Tablet Hub (each needs a partner or provider decision).
- Weekly billing needs Razorpay UPI Autopay or card mandates so weekly charges run without the family. Until then the mock gateway charges automatically.
- Intro calls: set `VIDEO_ROOM_URL_TEMPLATE` (for example a Zoom or Meet link with {room}); without it ops connects both by phone.
- Decision: extra allowance when the regular caregiver covers her own day off because no relief caregiver accepted.
- Relief offers go out 7 days ahead; the cron must run every minute (default job) for relief, billing and no show alerts.
