"use client";

import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";
import { ac, owner, staff, client } from "@/lib/permissions";

export const authClient = createAuthClient({
  // No explicit baseURL → Better Auth uses the current window origin. This
  // makes login work on localhost, a review tunnel, or a real deployment
  // alike, without rebaking a build-time URL.
  plugins: [
    adminClient({
      ac,
      roles: { owner, staff, client },
    }),
  ],
});

export const { signIn, signUp, signOut, useSession } = authClient;
