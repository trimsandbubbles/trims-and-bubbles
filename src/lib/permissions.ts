import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements, adminAc } from "better-auth/plugins/admin/access";

/**
 * Role model for Trims and Bubbles:
 *  - CLIENT: default role for public sign-ups. Can only ever see/manage their own
 *    pets, appointments, and payments (enforced in Server Actions, not here).
 *  - STAFF:  groomer/employee access to the admin panel (appointments, clients,
 *    photos/notes, calendar) but not business-critical settings.
 *  - OWNER:  full admin access, including services/pricing, availability, and
 *    payment overrides/refunds.
 *
 * IMPORTANT: the public registration Server Action must always hard-code
 * role: "client" server-side. Never trust a client-submitted role field.
 */
const statement = {
  ...defaultStatements,
} as const;

export const ac = createAccessControl(statement);

export const owner = ac.newRole({
  ...adminAc.statements,
});

export const staff = ac.newRole({
  user: ["list"],
});

export const client = ac.newRole({});
