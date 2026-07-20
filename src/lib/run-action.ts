"use client";

import { toast } from "sonner";

/**
 * Calls a server action from a client component and ALWAYS gives the user feedback.
 *
 * Why this exists: a server action that *throws* (rather than returning
 * `{status:"error"}`) is invisible. React hands a rejected promise inside
 * `startTransition` to `reportError`, which fires a global ErrorEvent — it does
 * not re-render, does not hit an error boundary, and does not run the caller's
 * `else` branch. In production the button simply un-spins and nothing happens,
 * which is exactly what testers reported for "Cancel booking". The auth helpers
 * in `src/lib/session.ts` throw on an expired session, so this is a real,
 * reachable path for any logged-in user whose cookie outlived their session.
 *
 * Every client component that invokes a server action should go through here.
 */

const GENERIC_ERROR = "Something went wrong at our end. Please try again — or give us a call and we'll sort it out.";
const SESSION_ERROR = "Your session has expired. Please log in again, then try once more.";

type AnyActionResult = { status: "success" | "error"; message?: string };

export type RunActionOptions<T> = {
  /** Toast shown on success. Omit for no success toast. */
  success?: string;
  /** Runs only on success, after the toast. */
  onSuccess?: (result: T) => void;
  /** Runs on any failure — returned error or thrown. */
  onError?: (message: string) => void;
};

/**
 * Returns the action's result on completion, or `null` if it threw.
 * Errors are surfaced as a toast in every case, so callers never need a
 * try/catch of their own.
 */
export async function runAction<T extends AnyActionResult>(
  action: () => Promise<T>,
  options: RunActionOptions<T> = {},
): Promise<T | null> {
  let result: T;
  try {
    result = await action();
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    // session.ts throws these prefixes; everything else is genuinely unexpected.
    const isAuth = raw.startsWith("UNAUTHORIZED") || raw.startsWith("FORBIDDEN");
    const message = isAuth ? SESSION_ERROR : GENERIC_ERROR;
    console.error("[runAction] server action threw:", error);
    toast.error(message);
    options.onError?.(message);
    return null;
  }

  if (result.status === "success") {
    if (options.success) toast.success(options.success);
    options.onSuccess?.(result);
    return result;
  }

  const message = result.message || GENERIC_ERROR;
  toast.error(message);
  options.onError?.(message);
  return result;
}
