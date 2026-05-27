import type { Metadata } from "next"
import { Suspense } from "react"
import { Inter } from "next/font/google"
import { AuthProvider } from "@/contexts/AuthContext"
import { ToastProvider } from "@/contexts/ToastContext"
import { AiPlannerFloatingChat } from "@/components/ai-planner-floating-chat"
import { DockBadgeSync } from "@/components/dock-badge-sync"
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark theme-dark" data-theme="dark" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <AuthProvider>
          <ToastProvider>
            {children}
            <DockBadgeSync />
            <Suspense fallback={null}>
              <AiPlannerFloatingChat />
            </Suspense>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
