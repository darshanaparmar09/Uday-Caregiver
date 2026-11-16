"use client";
import { useState } from "react";
import { RATING_AREAS } from "@uday/core";
import { api } from "../api";

const TAGS = ["Followed the care profile", "Kind and patient", "Would rehire", "Good with medicines", "Kept the home tidy"];

/** Five area rating. The overall score is the average, which smooths out one emotional moment. */
export function RateCare({ bookingId, name, onDone, compact }: { bookingId: string; name: string; onDone: () => void; compact?: boolean }) {
  const [areas, setAreas] = useState<Record<string, number>>({}); const [tags, setTags] = useState<string[]>([]); const [note, setNote] = useState(""); const [pub, setPub] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const done = RATING_AREAS.every(([k]) => areas[k]);
  const avg = done ? Math.round((RATING_AREAS.reduce((s, [k]) => s + areas[k], 0) / RATING_AREAS.length) * 10) / 10 : null;
  async function submit() { setBusy(true); setErr(""); try { await api(`/api/bookings/${bookingId}/action`, { body: { action: "rate", areas, tags, note: note || undefined, publicText: pub || undefined } }); onDone(); } catch (e: any) { setErr(e.message); setBusy(false); } }
  return (
    <div className="grid gap-3">
      {!compact && <h2 className="text-lg font-bold">Rate {name}</h2>}
      <p className="note">Rate each area. Your overall rating is the average, so one hard day does not outweigh the rest.</p>
      {RATING_AREAS.map(([k, label]) => (
        <div key={k} className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
          <span className="font-semibold text-ink">{label}</span>
          <span className="flex">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" aria-label={`${label} ${n} of 5`} aria-pressed={areas[k] === n} onClick={() => setAreas({ ...areas, [k]: n })}
            className={`grid h-11 w-11 place-items-center text-2xl ${n <= (areas[k] ?? 0) ? "text-orange-400" : "text-line"}`}>★</button>)}</span>
        </div>))}
      {avg !== null && <p className="font-semibold text-ink">Overall {avg} out of 5{avg <= 3 ? ". The care manager will call you about this." : ""}</p>}
      <div className="flex flex-wrap gap-2">{TAGS.map((t) => <button key={t} type="button" aria-pressed={tags.includes(t)} onClick={() => setTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t])}
        className={`min-h-[40px] rounded-full border px-3 text-sm ${tags.includes(t) ? "border-orange-400 bg-orange-50" : "border-line"}`}>{t}</button>)}</div>
      <textarea className="input min-h-[70px] py-3" placeholder="What would you tell other families? (shown on the caregiver's profile, without your name)" value={pub} onChange={(e) => setPub(e.target.value)} maxLength={400} />
      <textarea className="input min-h-[70px] py-3" placeholder="Anything else (private to Uday)" value={note} onChange={(e) => setNote(e.target.value)} />
      {err && <p role="alert" className="text-sm text-coral-600">{err}</p>}
      <button className="btn" disabled={!done || busy} onClick={submit}>Submit rating</button>
    </div>
  );
}
