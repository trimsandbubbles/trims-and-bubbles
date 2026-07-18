// READ-ONLY: confirm owner can reach the new admin Reviews tab in production.
import { request } from "playwright";
const BASE = "https://trims-and-bubbles.vercel.app";
const OWNER = { email: process.env.OWNER_EMAIL, password: process.env.OWNER_PASSWORD };

const api = await request.newContext();
const login = await api.post(`${BASE}/api/auth/sign-in/email`, {
  data: OWNER,
  headers: { origin: BASE, "content-type": "application/json" },
});
console.log("owner login:", login.status());

const admin = await api.get(`${BASE}/admin/reviews`);
const html = await admin.text();
console.log("/admin/reviews:", admin.status(), admin.url());
console.log("has 'Waiting for approval':", html.includes("Waiting for approval"));
console.log("has 'Live on the website':", html.includes("Live on the website"));

// Owner should NOT be offered a client review form (they're not a customer)
const pub = await api.get(`${BASE}/reviews`);
const pubHtml = await pub.text();
console.log("/reviews as owner — no client 'Write a review' CTA:", !pubHtml.includes("Write a review"));

await api.dispose();
