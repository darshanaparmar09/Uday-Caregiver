import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "./auth";
import { AppError } from "./bookings";
import { TransitionError } from "@uday/core";

/** Wraps a route handler: consistent JSON errors, no stack traces to clients. */
export function handle<A extends unknown[]>(fn: (...a: A) => Promise<unknown>) {
  return async (...a: A) => {
    try {
      const out = await fn(...a);
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (e: any) {
      if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e instanceof AppError) return NextResponse.json({ error: e.message, ...(e.data ?? {}) }, { status: e.status });
      if (e instanceof TransitionError) return NextResponse.json({ error: "This booking has already moved on. Refresh to see its latest state." }, { status: 409 });
      if (e instanceof ZodError) return NextResponse.json({ error: "Please check the details entered.", fields: e.flatten().fieldErrors }, { status: 422 });
      if (e?.message?.startsWith("Invalid phone")) return NextResponse.json({ error: e.message }, { status: 422 });
      console.error(e);
      return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
  };
}
export async function body(req: Request) { try { return await req.json(); } catch { return {}; } }

/**
 * Runs a write once per client operation id. The caregiver app sends X-Client-Op with every queued care log; if the
 * phone retries after a timeout, the stored answer is returned instead of writing the log (and alerting the family) twice.
 */
export async function once<T>(req: Request, userId: string, fn: () => Promise<T>): Promise<T> {
  const op = req.headers.get("x-client-op"); if (!op || op.length > 80) return fn();
  const { one, q } = await import("./db");
  const claim = await one<{ response: T | null }>("INSERT INTO client_ops (user_id, op_id) VALUES ($1,$2) ON CONFLICT (user_id, op_id) DO NOTHING RETURNING response", [userId, op]);
  if (!claim) { const prev = await one<{ response: T | null }>("SELECT response FROM client_ops WHERE user_id=$1 AND op_id=$2", [userId, op]); return (prev?.response ?? ({ ok: true, duplicate: true } as unknown as T)); }
  try { const out = await fn(); await q("UPDATE client_ops SET response=$3 WHERE user_id=$1 AND op_id=$2", [userId, op, JSON.stringify(out ?? { ok: true })]); return out; }
  catch (e) { await q("DELETE FROM client_ops WHERE user_id=$1 AND op_id=$2", [userId, op]).catch(() => {}); throw e; } // a refused write may be retried
}
