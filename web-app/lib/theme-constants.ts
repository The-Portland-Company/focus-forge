// Theme Types
export type ThemePreset = 'dark' | 'light' | 'liquid-glass-dark' | 'liquid-glass-light'

export interface Theme {
  id: ThemePreset
  name: string
  description: string
  allowsColorCustomization: boolean
  defaultColor?: string
  cssClass?: string
}

// Theme Definitions
export const THEME_PRESETS: Record<ThemePreset, Theme> = {
  dark: {
    id: 'dark',
    name: 'Dark',
    description: 'Classic dark theme with customizable accent colors',
    allowsColorCustomization: true,
    defaultColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    cssClass: 'theme-dark'
  },
  light: {
    id: 'light',
    name: 'Light',
    description: 'Clean light theme with customizable accent colors',
    allowsColorCustomization: true,
    defaultColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    cssClass: 'theme-light'
  },
  'liquid-glass-dark': {
    id: 'liquid-glass-dark',
    name: 'Liquid Glass Dark',
    description: 'Apple-inspired glassmorphism with subtle breathing colors',
    allowsColorCustomization: false,
    cssClass: 'dark theme-liquid-glass'
  },
  'liquid-glass-light': {
    id: 'liquid-glass-light',
    name: 'Liquid Glass Light',
    description: 'Apple-inspired glassmorphism with vibrant breathing colors',
    allowsColorCustomization: false,
    cssClass: 'light theme-liquid-glass'
  }
}

// Default theme constants  
export const DEFAULT_THEME_PRESET: ThemePreset = 'liquid-glass-dark'
export const DEFAULT_GRADIENT_THEME = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
export const DEFAULT_SOLID_COLOR = '#667eea' // Purple from the gradient
export const DEFAULT_COLOR_RGB = '102, 126, 234' // RGB values for the primary color

// Color options for customizable themes
export const GRADIENT_THEMES = {
  default: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', // Purple to violet
  ocean: 'linear-gradient(135deg, #00F260 0%, #0575E6 100%)', // Green to blue
  sunset: 'linear-gradient(135deg, #FA8BFF 0%, #2BD2FF 52%, #2BFF88 100%)', // Pink to cyan to green
  fire: 'linear-gradient(135deg, #F093FB 0%, #F5576C 100%)', // Pink to red
  forest: 'linear-gradient(135deg, #00C9FF 0%, #92FE9D 100%)', // Cyan to green
  royal: 'linear-gradient(135deg, #FC466B 0%, #3F5EFB 100%)', // Pink to blue
  gold: 'linear-gradient(135deg, #FDBB2D 0%, #22C1C3 100%)', // Gold to teal
  lavender: 'linear-gradient(135deg, #8EC5FC 0%, #E0C3FC 100%)', // Blue to lavender
}