/**
 * Normalizes thrown values from Supabase/PostgREST (often plain objects) into a string.
 */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string" && m.length > 0) return m;
  }
  if (typeof err === "string" && err.length > 0) return err;
  return "Unknown error";
}

/** Logs PostgREST-style fields when present (does not log secrets). */
export function logPostgrestError(scope: string, err: unknown): void {
  if (typeof err !== "object" || err === null) return;
  const o = err as { code?: unknown; details?: unknown; hint?: unknown };
  if ("code" in o || "details" in o || "hint" in o) {
    console.error(`[${scope}]`, {
      code: o.code,
      details: o.details,
      hint: o.hint,
    });
  }
}
