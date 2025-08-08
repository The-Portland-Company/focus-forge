'use client'

import { useEffect } from 'react'

export function HydrationFix() {
  useEffect(() => {
    // Clean up any inline styles with CSS variables after hydration
    const cleanInlineStyles = () => {
      const allElements = document.querySelectorAll('[style]')
      
      allElements.forEach(element => {
        const style = element.getAttribute('style')
        if (style && style.includes('--')) {
          // Parse and clean the style
          const styles = style.split(';').filter(s => s.trim())
          const cleanedStyles = styles.filter(s => !s.trim().startsWith('--'))
          
          if (cleanedStyles.length !== styles.length) {
            console.warn('[HydrationFix] Cleaned CSS variables from element:', element)
            element.setAttribute('style', cleanedStyles.join(';'))
          }
        }
      })
    }
    
    // Run immediately
    cleanInlineStyles()
    
    // Also run after a short delay to catch any dynamically added elements
    setTimeout(cleanInlineStyles, 100)
  }, [])
  
  return null
}