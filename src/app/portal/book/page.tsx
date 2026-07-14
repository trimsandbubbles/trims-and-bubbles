import { redirect } from "next/navigation";

// The same wizard at /book already recognizes a logged-in session and shows
// the client's own dogs, so the "portal" entry point is just a friendly alias.
export default function PortalBookRedirect() {
  redirect("/book");
}
