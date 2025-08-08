/**
 * Apply user theme colors to CSS variables
 * This centralizes theme application logic to ensure consistency
 */
export function applyUserTheme(color: string, animationsEnabled: boolean = true) {
  const root = document.documentElement
  let primaryColor = color
  
  // Handle gradients - extract first color for solid color needs
  if (color.startsWith('linear-gradient')) {
    const matches = color.match(/#[A-Fa-f0-9]{6}/g)
    if (matches && matches.length > 0) {
      primaryColor = matches[0]
    }
  }
  
  // Set all theme-related CSS variables
  root.style.setProperty('--user-profile-color', primaryColor)
  root.style.setProperty('--user-profile-gradient', color)
  root.style.setProperty('--theme-primary', primaryColor)
  root.style.setProperty('--theme-gradient', color)
  
  // Convert hex to RGB for use in rgba()
  if (primaryColor.startsWith('#') && primaryColor.length === 7) {
    const hex = primaryColor.replace('#', '')
    const r = parseInt(hex.substring(0, 2), 16)
    const g = parseInt(hex.substring(2, 4), 16)
    const b = parseInt(hex.substring(4, 6), 16)
    
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
      root.style.setProperty('--user-profile-color-rgb', `${r}, ${g}, ${b}`)
      root.style.setProperty('--theme-primary-rgb', `${r}, ${g}, ${b}`)
    } else {
      // Fallback to default orange color RGB
      root.style.setProperty('--user-profile-color-rgb', '234, 88, 12')
      root.style.setProperty('--theme-primary-rgb', '234, 88, 12')
    }
  } else {
    // Fallback to default orange color RGB
    root.style.setProperty('--user-profile-color-rgb', '234, 88, 12')
    root.style.setProperty('--theme-primary-rgb', '234, 88, 12')
  }
  
  // Toggle animations
  if (animationsEnabled) {
    root.classList.remove('no-animations')
  } else {
    root.classList.add('no-animations')
  }
}

/**
 * Get RGB values from hex color
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  if (!hex.startsWith('#') || hex.length !== 7) return null
  
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null
}