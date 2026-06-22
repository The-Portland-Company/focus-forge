import type { Metadata } from "next"
import "./globals.css"
import { SITE, SITE_URL } from "@/lib/site"
import { ThemeScript } from "@/components/ThemeScript"

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE.name} — ${SITE.tagline}`,
    template: `%s — ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: [
    "task manager",
    "project management",
    "AI agent",
    "Claude Code",
    "autonomous agents",
    "Todoist alternative",
    "productivity app",
    "macOS task manager",
    "iOS task manager",
  ],
  authors: [{ name: SITE.company }],
  creator: SITE.company,
  publisher: SITE.company,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE.name,
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
    images: [{ url: "/media/og.png", width: 1200, height: 630, alt: SITE.name }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
    images: ["/media/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
  },
  robots: { index: true, follow: true },
}

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: SITE.name,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web, iOS, macOS",
      description: SITE.description,
      url: SITE_URL,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      publisher: { "@type": "Organization", name: SITE.company },
    },
    {
      "@type": "Organization",
      name: SITE.company,
      url: "https://theportlandcompany.com",
      brand: { "@type": "Brand", name: SITE.name },
    },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
