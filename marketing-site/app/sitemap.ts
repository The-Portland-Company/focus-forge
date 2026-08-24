import type { MetadataRoute } from "next"
import { SITE_URL } from "@/lib/site"
import { COMPETITORS } from "@/lib/compare"

export const dynamic = "force-static"

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    "",
    "/compare",
    ...COMPETITORS.map((c) => `/compare/${c.slug}`),
    "/privacy",
    "/terms",
  ]
  return routes.map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: "monthly",
    priority: path === "" ? 1 : path.startsWith("/compare") ? 0.8 : 0.5,
  }))
}
