/**
 * Uday booking engine. Pure functions only: no database, no network.
 * Used by the API (authoritative) and by clients (display only).
 * All money is in paise (whole numbers). 100 paise = 1 rupee.
 */

export type CareType = "day" | "night" | "live";
export type Tier = 1 | 2 | 3;
export type BookingStatus =
  | "offered"     // payment held, waiting for caregiver
  | "proposal"    // caregiver declined or timed out; family must approve the next match
  | "accepted"    // confirmed, payment captured, next shift scheduled
  | "enroute"     // caregiver travelling
  | "arrived"     // at the door, waiting for start code
  | "active"      // shift in progress
  | "completed"   // all shifts done, waiting for rating
  | "closed"      // rated
  | "cancelled"   // cancelled by family
  | "released";   // no caregiver found; hold released

export const DURATIONS = [1, 7, 30, 90] as const;
export type Duration = (typeof DURATIONS)[number];

/** Working assumptions. Ops can override through settings; see docs. */
export const POLICY = {
  platformFeeBps: 800,          // 8.00% of care fee (assumption, CA to confirm)
  gstOnPlatformFeeBps: 1800,    // 18% GST on the platform fee (assumption, CA to confirm)
  freeCancelHours: 4,           // free cancellation window before a shift
  lateCancelBps: 2000,          // 20% of one day of care
  offerWindowSameDayMin: 30,    // caregiver answer window when start is within 24 hours
  offerWindowFutureMin: 240,    // answer window for later starts
  caregiverAccessAfterHours: 24 // caregiver keeps profile access this long after last shift
};

export interface Fees { ratePaise: number; days: number; carePaise: number; platformPaise: number; gstPaise: number; totalPaise: number }

export function fees(ratePaise: number, days: number, policy = POLICY): Fees {
  if (!Number.isInteger(ratePaise) || ratePaise <= 0) throw new Error("rate must be positive paise");
  if (!Number.isInteger(days) || days <= 0) throw new Error("days must be a positive integer");
  const carePaise = ratePaise * days;
  const platformPaise = Math.round((carePaise * policy.platformFeeBps) / 10000);
  const gstPaise = Math.round((platformPaise * policy.gstOnPlatformFeeBps) / 10000);
  return { ratePaise, days, carePaise, platformPaise, gstPaise, totalPaise: carePaise + platformPaise + gstPaise };
}

/** Which transitions are legal, and who may make them. */
export type Actor = "family" | "caregiver" | "system" | "ops";
const T: Record<BookingStatus, Partial<Record<BookingStatus, Actor[]>>> = {
  offered:   { accepted: ["caregiver", "ops"], proposal: ["caregiver", "system", "ops"], released: ["system", "ops"], cancelled: ["family", "ops"] },
  proposal:  { offered: ["family", "ops"], released: ["family", "system", "ops"], cancelled: ["family", "ops"] },
  accepted:  { enroute: ["caregiver"], proposal: ["caregiver", "ops"], cancelled: ["family", "ops"] },
  enroute:   { arrived: ["caregiver"], cancelled: ["family", "ops"], proposal: ["ops"] },
  arrived:   { active: ["caregiver"], cancelled: ["ops"] },
  active:    { accepted: ["caregiver", "system"], completed: ["caregiver", "system"] },
  completed: { closed: ["family", "system"] },
  closed: {}, cancelled: {}, released: {},
};

export function canTransition(from: BookingStatus, to: BookingStatus, actor: Actor): boolean {
  return (T[from]?.[to] ?? []).includes(actor);
}

export function assertTransition(from: BookingStatus, to: BookingStatus, actor: Actor): void {
  if (!canTransition(from, to, actor)) throw new TransitionError(from, to, actor);
}

export class TransitionError extends Error {
  constructor(public from: string, public to: string, public actor: string) {
    super(`${actor} cannot move a booking from ${from} to ${to}`);
  }
}

export const TERMINAL: BookingStatus[] = ["closed", "cancelled", "released"];

/** Offer window: shorter when care starts soon. */
export function offerWindowMinutes(startAt: Date, now = new Date(), policy = POLICY): number {
  return startAt.getTime() - now.getTime() < 24 * 3600e3 ? policy.offerWindowSameDayMin : policy.offerWindowFutureMin;
}

/** Start time of shift number `dayIndex` (0 based). Night shifts start 20:00, live in 09:00. */
export function shiftStart(startDate: string, startTime: string, dayIndex: number): Date {
  const [y, m, d] = startDate.split("-").map(Number);
  const [hh, mm] = startTime.split(":").map(Number);
  // Pune local time is UTC+05:30. Stored as an absolute instant.
  return new Date(Date.UTC(y, m - 1, d + dayIndex, hh, mm) - 330 * 60e3);
}

export interface CancelInput { status: BookingStatus; days: number; daysDone: number; totalPaise: number; ratePaise: number; nextShiftStart: Date }
export interface CancelQuote { feePaise: number; refundPaise: number; reason: "not_confirmed" | "free_window" | "late" }

/**
 * Cancellation and reschedule rule: free until 4 hours before the next shift, then 20% of one day of care.
 * Days already served are never refunded; unused days always are.
 */
export function cancelQuote(b: CancelInput, now = new Date(), policy = POLICY): CancelQuote {
  if (b.status === "offered" || b.status === "proposal") return { feePaise: 0, refundPaise: b.totalPaise, reason: "not_confirmed" };
  const started = b.status === "enroute" || b.status === "arrived" || b.status === "active";
  const hoursLeft = (b.nextShiftStart.getTime() - now.getTime()) / 3600e3;
  const unused = Math.floor((b.totalPaise * (b.days - b.daysDone)) / b.days);
  const late = started || hoursLeft <= policy.freeCancelHours;
  const feePaise = late ? Math.round((b.ratePaise * policy.lateCancelBps) / 10000) : 0;
  return { feePaise, refundPaise: Math.max(0, unused - feePaise), reason: late ? "late" : "free_window" };
}

export interface MatchCandidate { id: string; tier: Tier; careTypes: CareType[]; active: boolean; rating: number; areaKm?: number }

/** Next caregiver to propose after a decline or timeout: same tier, offers the care type, not tried, best ranked. */
export function nextMatch(c: MatchCandidate[], tier: Tier, careType: CareType, tried: string[]): MatchCandidate | null {
  const pool = c.filter((x) => x.active && x.tier === tier && x.careTypes.includes(careType) && !tried.includes(x.id));
  pool.sort((a, b) => (a.areaKm ?? 99) - (b.areaKm ?? 99) || b.rating - a.rating);
  return pool[0] ?? null;
}

/** Four digit start or end code. */
export function shiftCode(rand: () => number = Math.random): string {
  return String(1000 + Math.floor(rand() * 9000));
}

export function rupees(paise: number): string {
  return "₹" + Math.round(paise / 100).toLocaleString("en-IN");
}

export const LABELS: Record<BookingStatus, string> = {
  offered: "Waiting for caregiver", proposal: "Needs your approval", accepted: "Confirmed", enroute: "On the way",
  arrived: "Arrived", active: "Care in progress", completed: "Completed, rate it", closed: "Completed",
  cancelled: "Cancelled", released: "Cancelled, hold released",
};

// ───────── daily care checklist (from the Uday Daily Resident Care Checklist) ─────────
export interface ChecklistItem { id: string; label: string; minTier?: Tier }
export interface ChecklistSection { id: string; title: string; items: ChecklistItem[] }
export const CARE_CHECKLIST: ChecklistSection[] = [
  { id: "morning", title: "Morning routine", items: [
    { id: "hygiene", label: "Assist with hygiene (face, hands, hair)" }, { id: "medication", label: "Medication support (as prescribed, with time)" },
    { id: "breakfast", label: "Breakfast and fluid intake" }, { id: "dressing", label: "Help with dressing" }, { id: "skin_brief", label: "Brief skin check" } ] },
  { id: "health", title: "Health monitoring", items: [
    { id: "vitals", label: "Vital signs (BP, pulse, temperature)", minTier: 3 }, { id: "pain", label: "Pain level check" },
    { id: "skin", label: "Check for skin irritation or redness" }, { id: "appetite", label: "Appetite and weight changes" } ] },
  { id: "mobility", title: "Mobility and support", items: [
    { id: "walking", label: "Assist with safe walking" }, { id: "turning", label: "Position changes (turning)" },
    { id: "transfers", label: "Safe transfers" }, { id: "exercise", label: "Supervise exercise or movement" } ] },
  { id: "environment", title: "Environment and charting", items: [
    { id: "clean", label: "Clean living area" }, { id: "bed", label: "Prepare a comfortable bed" },
    { id: "documentation", label: "Full documentation (times, notes)" }, { id: "family", label: "Communicate with family" } ] },
];
export function checklistFor(tier: Tier): ChecklistSection[] {
  return CARE_CHECKLIST.map((s) => ({ ...s, items: s.items.filter((i) => !i.minTier || tier >= i.minTier) }));
}
export const CHECKLIST_IDS = new Set(CARE_CHECKLIST.flatMap((s) => s.items.map((i) => i.id)));

/** Readings outside these limits alert the family and Uday at once. Working assumptions for the clinical advisor to confirm. */
export const VITALS_LIMITS = { bpSys: [90, 160], bpDia: [50, 100], pulse: [50, 110], tempC: [35.5, 37.9], painAlertAt: 7 };
export interface Vitals { bpSys?: number; bpDia?: number; pulse?: number; tempC?: number; pain?: number }
export function vitalsFlags(v: Vitals, L = VITALS_LIMITS): string[] {
  const f: string[] = [];
  const out = (x: number | undefined, [lo, hi]: number[]) => x != null && (x < lo || x > hi);
  if (out(v.bpSys, L.bpSys) || out(v.bpDia, L.bpDia)) f.push(`Blood pressure ${v.bpSys ?? "?"}/${v.bpDia ?? "?"}`);
  if (out(v.pulse, L.pulse)) f.push(`Pulse ${v.pulse}`);
  if (out(v.tempC, L.tempC)) f.push(`Temperature ${v.tempC}°C`);
  if (v.pain != null && v.pain >= L.painAlertAt) f.push(`Pain ${v.pain} of 10`);
  return f;
}

// ───────── what care is needed (family picks one when hiring) ─────────
export interface CareNeed { id: string; group: string; label: string; tier: Tier; skills: string[] }
export const CARE_NEED_GROUPS = ["Recovery", "Long term conditions", "Disability support", "Short illness", "Daily living", "Hospital and outings", "Other"] as const;
export const CARE_NEEDS: CareNeed[] = [
  { id: "post_op", group: "Recovery", label: "After surgery", tier: 3, skills: ["Post surgery", "Wound care", "Vitals"] },
  { id: "discharge", group: "Recovery", label: "Back home from hospital", tier: 2, skills: ["Post surgery", "Mobility support", "Transfers"] },
  { id: "fracture", group: "Recovery", label: "Fracture or joint replacement", tier: 2, skills: ["Transfers", "Physio assist", "Mobility support"] },
  { id: "stroke", group: "Recovery", label: "Stroke recovery", tier: 2, skills: ["Bedridden support", "Transfers", "Physio assist"] },
  { id: "dementia", group: "Long term conditions", label: "Dementia or Alzheimer's", tier: 2, skills: ["Dementia care"] },
  { id: "parkinsons", group: "Long term conditions", label: "Parkinson's", tier: 2, skills: ["Mobility support", "Transfers"] },
  { id: "diabetes", group: "Long term conditions", label: "Diabetes", tier: 3, skills: ["Diabetes care", "Vitals"] },
  { id: "heart", group: "Long term conditions", label: "Heart or lung condition", tier: 3, skills: ["Vitals"] },
  { id: "palliative", group: "Long term conditions", label: "Cancer or end of life comfort care", tier: 3, skills: ["Vitals", "Hygiene"] },
  { id: "bedridden", group: "Long term conditions", label: "Bedridden care", tier: 2, skills: ["Bedridden support", "Hygiene", "Transfers"] },
  { id: "mobility", group: "Disability support", label: "Physical disability or wheelchair", tier: 2, skills: ["Mobility support", "Transfers"] },
  { id: "sensory", group: "Disability support", label: "Poor sight or hearing", tier: 1, skills: ["Companionship", "Walks"] },
  { id: "short_illness", group: "Short illness", label: "Fever, infection or short illness", tier: 2, skills: ["Meals", "Hygiene"] },
  { id: "companionship", group: "Daily living", label: "Company and daily help", tier: 1, skills: ["Companionship", "Meals", "Walks"] },
  { id: "falls", group: "Daily living", label: "Fall risk, needs supervision", tier: 1, skills: ["Mobility support", "Walks"] },
  { id: "hospital_visit", group: "Hospital and outings", label: "Doctor or hospital visit escort", tier: 1, skills: ["Companionship", "Mobility support"] },
  { id: "hospital_stay", group: "Hospital and outings", label: "Attendant during a hospital stay", tier: 2, skills: ["Hygiene", "Mobility support"] },
  { id: "other", group: "Other", label: "Something else", tier: 1, skills: [] },
];
export const careNeed = (id: string) => CARE_NEEDS.find((n) => n.id === id);

// ───────── what the family provides at home (agreed at checkout) ─────────
export const HOME_COMMITMENTS_VERSION = "2026-11-v1";
export function homeCommitments(careType: CareType): { id: string; label: string }[] {
  const all = [
    { id: "toilet", label: "A clean toilet with handwashing the caregiver can use" },
    { id: "water", label: "Drinking water" },
    { id: "belongings", label: "A safe place to keep belongings and charge a phone" },
    { id: "household", label: "I will tell Uday about pets, smokers and others living at home" },
    { id: "infection", label: "I will tell Uday if anyone at home has an infectious illness" },
    { id: "cameras", label: "I will tell the caregiver where any cameras are; none in toilets or rest areas" },
    { id: "scope", label: "Care tasks only: no cooking for the whole household or general house cleaning" },
  ];
  const night = [{ id: "rest_seat", label: "A place to sit or rest during quiet hours" }];
  const live = [
    { id: "meals", label: "Three meals a day, or a meal allowance agreed in advance" },
    { id: "bath", label: "A bathroom with bathing facility" },
    { id: "sleep", label: "A separate sleeping space with bed and bedding" },
    { id: "breaks", label: "At least 2 hours of break in the day and 8 hours of rest at night" },
    { id: "day_off", label: "A weekly day off, covered by an Uday relief caregiver" },
  ];
  return careType === "live" ? [...all, ...live] : careType === "night" ? [...all, ...night] : all;
}

// ───────── multi area rating (averages out one emotional score) ─────────
export const RATING_AREAS = [["punctuality", "On time"], ["quality", "Quality of care"], ["kindness", "Kindness and respect"], ["hygiene", "Hygiene and tidiness"], ["communication", "Communication"]] as const;
export type RatingArea = (typeof RATING_AREAS)[number][0];
export function overallRating(r: Partial<Record<RatingArea, number>>): number {
  const v = RATING_AREAS.map(([k]) => r[k]).filter((x): x is number => typeof x === "number" && x >= 1 && x <= 5);
  if (v.length !== RATING_AREAS.length) throw new Error("Rate all five areas from 1 to 5");
  return Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10;
}

// ───────── health readings and wearables ─────────
export const READING_KINDS = { bp_sys: ["BP upper", "mmHg"], bp_dia: ["BP lower", "mmHg"], pulse: ["Pulse", "bpm"], spo2: ["Oxygen", "%"], temp_c: ["Temperature", "°C"],
  glucose: ["Blood sugar", "mg/dL"], weight_kg: ["Weight", "kg"], steps: ["Steps", "steps"], sleep_hours: ["Sleep", "hours"], pain: ["Pain", "of 10"] } as const;
export type ReadingKind = keyof typeof READING_KINDS;
export const READING_RANGE: Record<ReadingKind, [number, number]> = { bp_sys: [50, 260], bp_dia: [30, 160], pulse: [25, 220], spo2: [50, 100], temp_c: [32, 43], glucose: [20, 600], weight_kg: [20, 250], steps: [0, 100000], sleep_hours: [0, 24], pain: [0, 10] };

/**
 * Ten common wearables and home devices. "phone" devices sync through Apple Health (iPhone) or
 * Health Connect (Android) on the senior's phone running the Uday app. "cloud" devices connect through
 * the maker's online API. Support marked verify must be confirmed by the agency before launch.
 */
export const WEARABLES = [
  { id: "apple_watch", name: "Apple Watch", via: "phone", path: "Apple Health on iPhone", reads: ["pulse", "spo2", "steps", "sleep_hours"], verify: false },
  { id: "galaxy_watch", name: "Samsung Galaxy Watch", via: "phone", path: "Samsung Health to Health Connect", reads: ["pulse", "spo2", "steps", "sleep_hours"], verify: false },
  { id: "fitbit", name: "Fitbit", via: "phone", path: "Fitbit app to Health Connect or Apple Health", reads: ["pulse", "spo2", "steps", "sleep_hours"], verify: false },
  { id: "pixel_watch", name: "Google Pixel Watch", via: "phone", path: "Fitbit app to Health Connect", reads: ["pulse", "spo2", "steps", "sleep_hours"], verify: false },
  { id: "garmin", name: "Garmin", via: "phone", path: "Garmin Connect to Health Connect or Apple Health", reads: ["pulse", "steps", "sleep_hours"], verify: true },
  { id: "amazfit", name: "Amazfit", via: "phone", path: "Zepp app to Health Connect or Apple Health", reads: ["pulse", "steps", "sleep_hours"], verify: true },
  { id: "noise", name: "Noise smartwatch", via: "phone", path: "NoiseFit app to Health Connect or Apple Health", reads: ["pulse", "steps", "sleep_hours"], verify: true },
  { id: "boat", name: "boAt smartwatch", via: "phone", path: "boAt Crest app to Health Connect or Apple Health", reads: ["pulse", "steps"], verify: true },
  { id: "omron", name: "Omron BP monitor", via: "phone", path: "OMRON connect app to Health Connect or Apple Health", reads: ["bp_sys", "bp_dia", "pulse"], verify: true },
  { id: "withings", name: "Withings (BP monitor, scale, watch)", via: "cloud", path: "Withings account, connected online", reads: ["bp_sys", "bp_dia", "pulse", "weight_kg", "spo2"], verify: true },
] as const;

// ───────── care facilities ─────────
export const FACILITY_TYPES = { assisted_living: "Assisted living", nursing_home: "Nursing home (skilled nursing)", memory_care: "Memory care", retirement_community: "Retirement community", respite: "Short stay and respite", rehab: "Rehabilitation centre" } as const;
export type FacilityType = keyof typeof FACILITY_TYPES;
/** Listing plans for facilities, billed monthly. Prices are assumptions until Uday sets them. */
export const FACILITY_PLANS = { listed: { name: "Listed", pricePaise: 499900, features: ["Profile and photos", "Visit requests from families", "Family reviews"] },
  featured: { name: "Featured", pricePaise: 999900, features: ["Everything in Listed", "Shown first in search", "Monthly enquiry report"] } } as const;
export type FacilityPlan = keyof typeof FACILITY_PLANS;
export const FACILITY_REVIEW_AREAS = [["care", "Care"], ["staff", "Staff"], ["cleanliness", "Cleanliness"], ["activities", "Activities"], ["value", "Value for money"]] as const;
