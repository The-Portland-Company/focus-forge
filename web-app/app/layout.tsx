import type { Metadata, Viewport } from "next"
import { Suspense } from "react"
import { Inter } from "next/font/google"
import { AuthProvider } from "@/contexts/AuthContext"
import { ToastProvider } from "@/contexts/ToastContext"
import { AiPlannerFloatingChatLazy } from "@/components/ai-planner-floating-chat-lazy"
import { ChunkErrorReloader } from "@/components/chunk-error-reloader"
import { DockBadgeSync } from "@/components/dock-badge-sync"
import { EstimateReviewNudge } from "@/components/estimate-review-nudge"
import { AgentIntroNudge } from "@/components/agent-intro-nudge"
import { THEME_PREPAINT_SCRIPT } from "@/lib/theme-prepaint"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Focus: Forge",
  description: "A powerful project management and task organization tool",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Focus: Forge",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className="dark theme-dark theme-neutral"
      data-theme="neutral-dark"
      suppressHydrationWarning
    >
      <head>
        {/* Applies the stored theme before first paint. Without this the
            document paints the SSR preset, then React re-applies the real one
            after hydration + the profile fetch, which flashed the default
            blue/purple gradient through --theme-gradient consumers such as
            the sidebar's .btn-theme-primary buttons. Must stay a blocking
            inline script: anything async paints too late. */}
        <script
          dangerouslySetInnerHTML={{ __html: THEME_PREPAINT_SCRIPT }}
        />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <AuthProvider>
          <ToastProvider>
            <ChunkErrorReloader />
            {children}
            <DockBadgeSync />
            <Suspense fallback={null}>
              <AiPlannerFloatingChatLazy />
            </Suspense>
            <Suspense fallback={null}>
              <EstimateReviewNudge />
            </Suspense>
            <Suspense fallback={null}>
              <AgentIntroNudge />
            </Suspense>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
