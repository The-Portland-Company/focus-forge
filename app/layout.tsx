import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { AuthProvider } from "@/contexts/auth-context"
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
                
                const userColor = localStorage.getItem('userProfileColor');
                const animationsEnabled = localStorage.getItem('animationsEnabled');
                
                // Always set a valid RGB value to prevent hydration errors
                document.documentElement.style.setProperty('--user-profile-color-rgb', '234, 88, 12');
                document.documentElement.style.setProperty('--theme-primary-rgb', '234, 88, 12');
                
                if (userColor) {
                  document.documentElement.style.setProperty('--user-profile-color', userColor);
                  document.documentElement.style.setProperty('--theme-gradient', userColor);
                  
                  // Handle gradients vs solid colors
                  let primaryColor = userColor;
                  if (userColor.includes('gradient') && userColor.includes('#')) {
                    const matches = userColor.match(/#[A-Fa-f0-9]{6}/g);
                    if (matches && matches.length > 0) {
                      primaryColor = matches[0];
                    }
                  }
                  
                  // Set theme primary color
                  document.documentElement.style.setProperty('--theme-primary', primaryColor);
                  
                  // Convert hex to RGB only if we have a valid hex color
                  if (primaryColor && primaryColor.startsWith('#') && primaryColor.length === 7) {
                    try {
                      const hex = primaryColor.substring(1);
                      const r = parseInt(hex.substring(0, 2), 16);
                      const g = parseInt(hex.substring(2, 4), 16);
                      const b = parseInt(hex.substring(4, 6), 16);
                      
                      if (!isNaN(r) && !isNaN(g) && !isNaN(b) && r >= 0 && r <= 255 && g >= 0 && g <= 255 && b >= 0 && b <= 255) {
                        document.documentElement.style.setProperty('--user-profile-color-rgb', r + ', ' + g + ', ' + b);
                        document.documentElement.style.setProperty('--theme-primary-rgb', r + ', ' + g + ', ' + b);
                      }
                    } catch (e) {
                      // Keep default RGB on any parsing error
                    }
                  }
                }
                
                if (animationsEnabled === 'false') {
                  document.documentElement.classList.add('no-animations');
                }
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