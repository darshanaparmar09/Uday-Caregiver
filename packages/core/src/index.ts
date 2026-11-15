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
