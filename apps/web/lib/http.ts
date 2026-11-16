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
