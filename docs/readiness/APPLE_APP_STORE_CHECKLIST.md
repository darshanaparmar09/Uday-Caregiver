# Apple App Store: what must be corrected before submission

Apps: **Uday** (`in.uday.app`, family and senior) and **Uday Caregiver** (`in.uday.caregiver`).
Checked 17 November 2026 against Apple's official pages (sources at the end). Status: **Done** on branch `readiness-sprint`, **Open (dev)** engineering work, **Open (owner)** account or business action.

## Blockers

| # | Requirement | Status | Detail |
|---|---|---|---|
| A1 | Built with Xcode 26 and the iOS 26 SDK (required since 28 Apr 2026) | **Open (dev)** | Expo SDK 52 cannot meet this. Upgrade both apps to Expo SDK 54 or later, rebuild with EAS, retest on a device. [1][2] |
| A2 | Account deletion inside the app (Guideline 5.1.1(v)) | **Done** | Me, Your data, Delete my account, in both apps. Also on the web. [3] |
| A3 | Privacy policy link in the app and in App Store Connect | **Open (owner)** | `/legal` is a placeholder. Counsel approved policy must be live before submission. [3] |
| A4 | App icon and launch screen | **Done (placeholder)** | 1024 px icon, splash added. Replace with designer artwork before launch. |
| A5 | Real API address and EAS project | **Open (owner)** | `eas.json` still points to `uday.example`; `extra.eas.projectId` is `SET_BY_AGENCY`. Set the real domain and run `eas init`. |
| A6 | Reviewer sign in (Guideline 2.1) | **Done in code, Open (owner)** | Set `OTP_TEST_ACCOUNTS` on the review server with one family, one senior and one caregiver number, and give these in App Review notes. [3] |

## Must fix (rejection risk)

| # | Requirement | Status | Detail |
|---|---|---|---|
| A7 | User generated content: filter, report, block, contact and timely action (Guideline 1.2) | **Done** | Community rules accepted before posting; report post; report and block person; Operations queue; phone numbers and links filtered. Owner must staff the queue (aim: 24 hours). [3] |
| A8 | AI companion: disclose AI, get consent before sending data to a third party AI (Guideline 5.1.2(i)) | **Done** | Consent screen names Anthropic, AI label on each reply, report reply, can withdraw. [3] |
| A9 | Privacy manifest with required reason APIs | **Done** | `ios.privacyManifests` added for UserDefaults, file timestamp, boot time, disk space. Recheck the generated manifest after the SDK upgrade, since third party libraries add their own. [1][4] |
| A10 | HealthKit: only request what you use; no write permission text if you do not write | **Done** | `NSHealthUpdateUsageDescription` removed; read only. |
| A11 | HealthKit data never used for advertising, never stored in iCloud (Guideline 5.1.3) | **Done in code** | Health data stays in the Uday database, encrypted. State this in the privacy policy. |
| A12 | Medical and health apps: no diagnosis claims (Guideline 1.4.1) | **Done** | Wording says "not a medical assessment"; companion says "not a doctor". Keep store listing free of clinical claims. [3] |
| A13 | SOS wording must not imply an emergency service | **Done** | App tells the person to call 112 and states what Uday sends. Add "Uday is not an emergency service" to the store description. |
| A14 | Export compliance | **Done** | `ITSAppUsesNonExemptEncryption: false` (standard HTTPS only). |
| A15 | Permissions match use: camera not requested; microphone only for Speak to Uday, companion voice and caregiver dictation | **Done** | Image picker set to library only. Microphone purpose strings set in both apps (added 21 Nov 2026). Speech is sent to Sarvam AI: declare it in App Privacy (Audio Data) and the privacy policy. |
| A16 | Build number management | **Done** | `buildNumber` set; `cli.appVersionSource: remote` with auto increment. |

## Owner actions in App Store Connect

| # | Action | Notes |
|---|---|---|
| A17 | App Privacy labels | Declare: phone number, name, precise location (caregiver app), health and fitness, user content, identifiers. Linked to identity; not used for tracking. |
| A18 | Age rating questionnaire (new system since 31 Jan 2026) | Answer for both apps. Community and AI chat affect the answers. [1] |
| A19 | Organisation developer account and D-U-N-S number | Publish under the company, not an individual, for a health and safety app. |
| A20 | Uday Plus classification | **Unverified.** If Plus unlocks features in the app, Apple may require in app purchase (Guideline 3.1.1). If it is a care service delivered in the physical world, outside payment is allowed (3.1.3(e)). Decide before submission. [3] |
| A21 | Support URL and contact | Required in App Store Connect. |
| A22 | Hindi and Marathi strings | Native speaker review before listing in those languages. |

## Sources
1. Apple, Upcoming requirements: https://developer.apple.com/news/upcoming-requirements/ (read 17 Nov 2026)
2. Expo, App Store Connect minimum SDK: https://expo.dev/blog/app-store-connect-minimum-sdk-26
3. Apple, App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
4. Apple, Describing use of required reason API: https://developer.apple.com/documentation/bundleresources/privacy_manifest_files/describing_use_of_required_reason_api
