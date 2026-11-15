# Deployment

## Hosting (India region)

All personal data stays in India. Any of these works: AWS Mumbai (ap-south-1), Google Cloud Mumbai (asia-south1), Azure Central India.

| Component | Recommended | Notes |
| --- | --- | --- |
| Web and API | Container (`apps/web/Dockerfile`) on a managed service, 2 instances minimum | Runs migrations on start |
| Database | Managed PostgreSQL 16, encrypted at rest, point in time recovery, private network only | Daily backups tested by restore |
| Secrets | Cloud secret manager or key vault | Never in code or images |
| Scheduler | Cloud scheduler calling `POST /api/cron` every minute with header `x-cron-secret` | Expires unanswered offers, alerts missed check ins |
| Files (later) | Private object storage with per file encryption | For prescriptions and documents |
| TLS and WAF | Managed load balancer with TLS 1.2+, web application firewall | Security headers are set by the app |

## Environment variables

See `.env.example`. In production:

- `UDAY_ENV=production` (or unset). This refuses the fixed test OTP, logged SMS and mock payments.
- `FIELD_KEY_PII` and `FIELD_KEY_HEALTH`: two different 32 byte keys from the key vault. Losing them makes encrypted data unreadable; rotating needs a re-encryption job.
- `LOOKUP_KEY`, `SESSION_SECRET`, `CRON_SECRET`: long random values.
- `GATEWAY=razorpay` plus its keys once the gateway is chosen. `SMS_PROVIDER` once the OTP provider is implemented.
- `ALLOWED_ORIGINS`: leave empty in production unless a browser client on another domain needs the API.

## Mobile app builds

Uses Expo Application Services (EAS).

```bash
cd apps/mobile
npx eas login                      # Uday's Expo account
npx eas build --profile preview    # internal Android APK for testers
npx eas build --profile production --platform all
npx eas submit --platform all      # needs Apple Developer and Google Play accounts in Uday's name
```

Set the API address per profile in `apps/mobile/eas.json`. Bundle identifier `in.uday.app` (change if the domain differs).

## Staging first

Run a staging copy with `UDAY_ENV=staging`, `GATEWAY=mock` and the seed data. Rehearse the full pilot flow there before production.
