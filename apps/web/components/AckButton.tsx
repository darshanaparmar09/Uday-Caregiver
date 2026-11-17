"use client";
import { useState } from "react";
export function AckButton({ token, done, by, first }: { token: string; done: boolean; by?: string | null; first: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">(done ? "done" : "idle"); const [who, setWho] = useState(by ?? "");
  async function go() { setState("busy"); try { const r = await fetch(`/api/alerts/link/${token}`, { method: "POST" }); const j = await r.json(); if (!r.ok) throw new Error(j.error); setWho(j.acknowledgedBy ?? ""); setState("done"); } catch { setState("error"); } }
  if (state === "done") return <p role="status" className="rounded-xl bg-teal-50 p-4 text-lg font-semibold text-teal-700">{who ? `${who} is responding.` : "Someone is responding."} {first}'s family and Uday can see this.</p>;
  return <><button className="btn min-h-[64px] text-xl" disabled={state === "busy"} onClick={go}>{state === "busy" ? "Sending" : "I am responding"}</button>
    {state === "error" && <p role="alert" className="text-red-700">Could not record that. Please call {first} anyway.</p>}</>;
}
