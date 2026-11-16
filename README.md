# Uday caregiver

Care marketplace for Pune: families hire Uday certified caregivers by day shift, night shift or 24 hour live in care, for a day, week, month or quarter. Seniors get a free daily check in.

| Part | Folder | Technology |
| --- | --- | --- |
| Website, family web app, operations board and API | `apps/web` | Next.js 14 (App Router), TypeScript, Tailwind |
| Mobile app: senior check in, family, caregiver (one app, three roles) | `apps/mobile` | React Native with Expo SDK 52 |
| Booking engine (fees, state machine, cancellation, cascade) | `packages/core` | TypeScript, no dependencies |
| Database schema and migrations | `db` | PostgreSQL 16 |

## Run it locally (about 10 minutes)

Needs Node 20+ and PostgreSQL 16 (or Docker).

```bash
npm install
cp .env.example apps/web/.env.local       # then fill the keys: openssl rand -base64 32
docker compose up -d db                   # or use a local PostgreSQL
set -a; . apps/web/.env.local; set +a
npm run db:migrate && npm run db:seed     # seed prints sample caregiver phone numbers
npm run dev                               # http://localhost:3000
```

Sign in with any Indian mobile number; in development the code is `OTP_DEV_CODE` (123456). Seeded caregivers sign in on the app with `+919000000001` to `+919000000007`; ops with `+919000000099` at `/ops`.

Mobile app:

```bash
cd apps/mobile && npm install
EXPO_PUBLIC_API_URL=http://<your computer's LAN IP>:3000 npx expo start   # scan with Expo Go
```

## Tests

```bash
npm test -w @uday/core                                        # booking engine: fees, cancellation, cascade, permissions
BASE_URL=http://localhost:3000 npm test -w @uday/web          # end to end: booking lifecycle, caregiver onboarding to payout, access control
```

## Design rules

Website: modern, indigo and orange accents, Plus Jakarta Sans and Inter. Tokens in `apps/web/tailwind.config.ts`.

Mobile app: warm sunrise palette (night `#1A1040`, amber `#F5A623`, peach `#FDE8CC`, teal `#2A8C7E` for okay, coral `#E84545` for emergency only), Hind, 22px minimum labels, 72px minimum touch targets. Tokens in `apps/mobile/src/theme.ts`. The senior check in is one enormous pulsing sunrise that fills the screen.

## Read next

- `docs/DEPLOYMENT.md`: hosting, secrets, store builds, scheduler.
- `docs/GO_LIVE.md`: what must be finished or connected before real families and money.
