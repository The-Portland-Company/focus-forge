import { ThemePreset, THEME_PRESETS, DEFAULT_THEME_PRESET, DEFAULT_GRADIENT_THEME } from './theme-constants'

/**
 * Apply complete theme including preset and color
 */
export function applyTheme(
  themePreset: ThemePreset = DEFAULT_THEME_PRESET,
  color?: string,
  animationsEnabled: boolean = true
) {
  const root = document.documentElement
  const theme = THEME_PRESETS[themePreset]
  
  // Safety check - if theme doesn't exist, use default
  if (!theme) {
    console.warn(`Theme preset '${themePreset}' not found, using default`)
    return applyTheme(DEFAULT_THEME_PRESET, color, animationsEnabled)
  }
  
  // Remove all theme classes first
  Object.values(THEME_PRESETS).forEach(t => {
    if (t && t.cssClass && typeof t.cssClass === 'string') {
      // Split CSS classes in case there are multiple classes
      const classes = t.cssClass.split(' ').filter(cls => cls.trim())
      classes.forEach(cls => {
        if (cls) {
          root.classList.remove(cls)
        }
      })
    }
  })
  
  // Apply the selected theme class
  if (theme && theme.cssClass && typeof theme.cssClass === 'string') {
    // Split CSS classes in case there are multiple classes
    const classes = theme.cssClass.split(' ').filter(cls => cls.trim())
    classes.forEach(cls => {
      if (cls) {
        root.classList.add(cls)
      }
    })
  }
  
  // Set theme preset data attribute for CSS targeting
  root.setAttribute('data-theme', themePreset)
  
  // Apply color if theme allows customization or use default
  let themeColor = color
  if (!theme.allowsColorCustomization) {
    // For fixed themes like liquid-glass, use predefined colors
    themeColor = theme.defaultColor || DEFAULT_GRADIENT_THEME
  } else {
    // For customizable themes, use provided color or theme default
    themeColor = color || theme.defaultColor || DEFAULT_GRADIENT_THEME
  }
  
  if (themeColor) {
    applyUserTheme(themeColor, animationsEnabled)
  }
  
  // Toggle animations
  if (animationsEnabled) {
    root.classList.remove('no-animations')
  } else {
    root.classList.add('no-animations')
  }
}

/**
 * Apply user theme colors to CSS variables (legacy function for backward compatibility)
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