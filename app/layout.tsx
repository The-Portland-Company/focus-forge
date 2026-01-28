import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { AuthProvider } from "@/contexts/AuthContext"
import { ToastProvider } from "@/contexts/ToastContext"
import { HydrationFix } from "@/components/hydration-fix"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Command Center",
  description: "A powerful project management and task organization tool",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark theme-liquid-glass" data-theme="liquid-glass-dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Apply user settings immediately to prevent flash
              (function() {
                // Prevent hydration errors by ensuring CSS variables are never in inline styles
                if (typeof MutationObserver !== 'undefined') {
                  const observer = new MutationObserver((mutations) => {
                    mutations.forEach((mutation) => {
                      if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                        const target = mutation.target;
                        if (target && target.style) {
                          const style = target.getAttribute('style');
                          if (style && style.includes('--')) {
                            const cleaned = style.split(';')
                              .filter(s => !s.trim().startsWith('--'))
                              .join(';');
                            target.setAttribute('style', cleaned);
                          }
                        }
                      }
                    });
                  });
                  
                  // Start observing immediately
                  observer.observe(document.documentElement, {
                    attributes: true,
                    attributeFilter: ['style'],
                    subtree: true
                  });
                  
                  // Stop after hydration (5 seconds should be enough)
                  setTimeout(() => observer.disconnect(), 5000);
                }
                
                // Set default gradient theme immediately
                document.documentElement.style.setProperty('--user-profile-color', '#667eea');
                document.documentElement.style.setProperty('--user-profile-gradient', 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)');
                document.documentElement.style.setProperty('--theme-primary', '#667eea');
                document.documentElement.style.setProperty('--theme-gradient', 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)');
                document.documentElement.style.setProperty('--user-profile-color-rgb', '102, 126, 234');
                document.documentElement.style.setProperty('--theme-primary-rgb', '102, 126, 234');
                
                // User's custom theme will be applied by AuthContext after authentication
              })();
            `,
          }}
        />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <AuthProvider>
          <ToastProvider>
            <HydrationFix />
            {children}
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
