import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { AuthProvider } from "@/contexts/AuthContext"
import { HydrationFix } from "@/components/hydration-fix"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Project Manager",
  description: "A task management tool similar to Todoist",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
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
                
                // Always set a valid RGB value to prevent hydration errors
                document.documentElement.style.setProperty('--user-profile-color-rgb', '234, 88, 12');
                document.documentElement.style.setProperty('--theme-primary-rgb', '234, 88, 12');
                
                // Theme will be applied by AuthContext after Supabase loads
              })();
            `,
          }}
        />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <AuthProvider>
          <HydrationFix />
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}