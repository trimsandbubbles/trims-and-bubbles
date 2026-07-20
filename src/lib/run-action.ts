"use client";

import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";

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
const SESSION_ERROR = "You've been logged out. Please log in again, then try once more.";

type AnyActionResult = { status: "success" | "error"; message?: string };

/** True if the browser still has a valid session. Used only to explain a
 * failure after the fact, so it fails OPEN: if the check itself errors we
 * assume the session is fine and fall back to the generic message. */
async function hasLiveSession(): Promise<boolean> {
  try {
    const { data } = await authClient.getSession();
    return Boolean(data?.session);
  } catch {
    return true;
  }
}

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
    console.error("[runAction] server action threw:", error);
    // We can't tell WHY it threw from the message: Next.js redacts real Server
    // Action error text in production builds, so the "UNAUTHORIZED" thrown by
    // session.ts never reaches the browser. Ask the auth endpoint directly
    // instead — an expired session is by far the most common cause, and
    // "log in again" is a fix the user can actually act on, whereas the
    // generic message would send them off to phone the salon for nothing.
    const message = (await hasLiveSession()) ? GENERIC_ERROR : SESSION_ERROR;
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
