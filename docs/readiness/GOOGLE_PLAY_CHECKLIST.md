# Google Play: what must be corrected before submission

Apps: **Uday** (`in.uday.app`, family and senior) and **Uday Caregiver** (`in.uday.caregiver`).
Checked 17 November 2026 against Google's official pages (sources at the end). Status: **Done** on branch `readiness-sprint`, **Open (dev)** engineering work, **Open (owner)** account or business action.

## Blockers

| # | Requirement | Status | Detail |
|---|---|---|---|
| G1 | Target API level 36 for new apps and updates (since 31 Aug 2026; the extension option ended 1 Nov 2026) | **Open (dev)** | Expo SDK 52 targets API 35. Upgrade to Expo SDK 54 or later. The pinned `compileSdkVersion` and `targetSdkVersion: 35` were removed so the SDK default applies. [1] |
| G2 | 16 KB memory page size support for native libraries | **Open (dev)** | Comes with the SDK upgrade; confirm with the Play Console pre launch report. [2] |
| G3 | Account deletion inside the app **and** a web link that works without the app | **Done** | In app: Me, Your data. Web: `/delete-account` (public). Enter that URL in the Data safety form. [3] |
| G4 | Privacy policy URL | **Open (owner)** | `/legal` is a placeholder until counsel approves. [4] |
| G5 | App icon and adaptive icon | **Done (placeholder)** | Adaptive foreground and splash added. Replace with designer artwork. |
| G6 | Real API address and EAS project | **Open (owner)** | Same as Apple: replace `uday.example` and `SET_BY_AGENCY`. |
| G7 | Reviewer access | **Done in code, Open (owner)** | `OTP_TEST_ACCOUNTS` on the review server; give numbers and codes under App access. |

## Must fix (rejection risk)

| # | Requirement | Status | Detail |
|---|---|---|---|
| G8 | User generated content policy: terms acceptance, in app reporting, blocking, moderation | **Done** | Rules acceptance, report post, report and block person, Operations queue. Owner must staff moderation. [5] |
| G9 | AI generated content: prevent offensive output and act on user feedback | **Done** | Safety prompt, crisis words routed to an alert, report button on every companion reply, Operations queue. The help page asks developers to "incorporate user feedback"; an in app flag is how Uday meets it. [6] |
| G10 | Health Connect: declare each permission and justify it in the Health apps declaration | **Open (owner)** | Read only: heart rate, oxygen, steps, sleep, blood pressure, weight. Complete the declaration form in Play Console. [7] |
| G11 | Health apps declaration and "not a medical device" disclaimer | **Open (owner)** | Complete in Play Console; add disclaimer to listing. Wording in the app already says "not a medical assessment". [7] |
| G12 | Permissions: request only what is used | **Done** | Caregiver app blocks CAMERA. RECORD_AUDIO is now used in both apps, only while the person taps the microphone (added 21 Nov 2026). Declare Audio in the Data safety form; speech goes to Sarvam AI. |
| G13 | Version code management | **Done** | `versionCode` set; remote auto increment in EAS. |
| G14 | SOS feature wording | **Done in app** | Add "Uday is not an emergency service. Call 112." to the listing. |

## Owner actions in Play Console

| # | Action | Notes |
|---|---|---|
| G15 | Data safety form | Collected: phone, name, approximate and precise location (caregiver), health info, messages, photos (caregiver documents). Encrypted in transit; deletion available via app and URL. |
| G16 | Content rating questionnaire (IARC) | Both apps. Users interact; shares location (caregiver). |
| G17 | Organisation developer account with D-U-N-S | Required for organisation accounts; also needed for health apps credibility. |
| G18 | Closed testing before production (new personal accounts need 12 testers for 14 days) | Applies only if published from a personal account created after Nov 2023. An organisation account avoids it. [8] |
| G19 | Uday Plus payment method | **Unverified.** Physical care services may use outside billing; digital features sold in app need Google Play Billing. Confirm classification. [9] |
| G20 | Hindi and Marathi listing and strings | Native speaker review. |

## Sources
1. Target API level requirements: https://developer.android.com/google/play/requirements/target-sdk (read 17 Nov 2026)
2. Support 16 KB page sizes: https://developer.android.com/guide/practices/page-sizes
3. Account deletion requirements: https://support.google.com/googleplay/android-developer/answer/13327111
4. User data policy: https://support.google.com/googleplay/android-developer/answer/10144311
5. User generated content policy: https://support.google.com/googleplay/android-developer/answer/9876937
6. AI generated content policy: https://support.google.com/googleplay/android-developer/answer/14094294
7. Health apps and Health Connect: https://support.google.com/googleplay/android-developer/answer/14738291
8. App testing requirements for new personal accounts: https://support.google.com/googleplay/android-developer/answer/14151465
9. Payments policy: https://support.google.com/googleplay/android-developer/answer/9858738
