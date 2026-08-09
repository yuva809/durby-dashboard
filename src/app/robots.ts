import type { MetadataRoute } from "next";

// This is the authenticated dashboard app (dashboard.durby.tech) — it has
// no public marketing content and should never be indexed. Every route
// requires a signed-in session anyway; disallowing crawlers is defense in
// depth, not the primary access control.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
