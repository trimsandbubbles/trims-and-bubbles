import type { MetadataRoute } from "next";

const SITE_URL = "https://trimsandbubbles.com.au";

/** Public pages, for search engines. Admin/portal/auth pages are intentionally
 * excluded (they're private or low-value for search). */
export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["", "/services", "/gallery", "/reviews", "/about", "/contact", "/book", "/store", "/legal/privacy", "/legal/terms"];
  return paths.map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: "weekly",
    priority: path === "" ? 1 : 0.7,
  }));
}
