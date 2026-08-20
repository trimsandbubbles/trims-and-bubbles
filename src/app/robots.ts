import type { MetadataRoute } from "next";

const SITE_URL = "https://trimsandbubbles.com.au";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Private / non-indexable areas.
      disallow: ["/admin", "/portal", "/api/", "/reset-password", "/forgot-password"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
