"use client"

import { useState } from 'react'
import { Check, Palette } from 'lucide-react'
import { ThemePreset, THEME_PRESETS, DEFAULT_THEME_PRESET } from '@/lib/theme-constants'
import { ThemePicker } from './theme-picker'

interface ThemeSwitcherProps {
  currentTheme: ThemePreset
  currentColor?: string
  onThemeChange: (theme: ThemePreset) => void
  onColorChange?: (color: string) => void
}

export function ThemeSwitcher({ 
  currentTheme, 
  currentColor, 
  onThemeChange, 
  onColorChange 
}: ThemeSwitcherProps) {
  const [showColorPicker, setShowColorPicker] = useState(false)
  const selectedTheme = THEME_PRESETS[currentTheme] || THEME_PRESETS[DEFAULT_THEME_PRESET]

  return (
    <div className="space-y-4">
      {/* Theme Preset Selection */}
      <div>
        <label className="block text-sm font-medium text-zinc-200 mb-3">
          Theme Style
        </label>
        <div className="grid gap-3">
          {Object.values(THEME_PRESETS).map((theme) => (
            <button
              key={theme.id}
              onClick={() => onThemeChange(theme.id)}
              className={`
                relative p-4 rounded-lg border-2 text-left transition-all
                ${currentTheme === theme.id
                  ? 'border-theme-primary bg-theme-primary/10'
                  : 'border-zinc-700 bg-zinc-800 hover:border-zinc-600'
                }
              `}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-white">{theme.name}</h3>
                  <p className="text-sm text-zinc-400 mt-1">{theme.description}</p>
                  {!theme.allowsColorCustomization && (
                    <span className="inline-block mt-2 px-2 py-1 text-xs bg-zinc-700 text-zinc-300 rounded">
                      Fixed Style
                    </span>
                  )}
                </div>
                {currentTheme === theme.id && (
                  <Check className="w-5 h-5 text-theme-primary flex-shrink-0" />
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Color Customization (only for themes that allow it) */}
      {selectedTheme && selectedTheme.allowsColorCustomization && onColorChange && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium text-zinc-200">
              Accent Color
            </label>
            <button
              onClick={() => setShowColorPicker(!showColorPicker)}
              className="flex items-center gap-2 px-3 py-1 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors"
            >
              <Palette className="w-4 h-4" />
              Customize
            </button>
          </div>
          
          {/* Current Color Preview */}
          <div className="flex items-center gap-3 p-3 bg-zinc-800 rounded-lg">
            <div 
              className="w-8 h-8 rounded-full border-2 border-zinc-600"
              style={{ background: currentColor || selectedTheme.defaultColor }}
            />
            <div className="text-sm text-zinc-300">
              Current accent color
            </div>
          </div>

          {/* Color Picker */}
          {showColorPicker && (
            <div className="mt-3">
              <ThemePicker
                currentColor={currentColor || selectedTheme.defaultColor || ''}
                onColorChange={(color) => {
                  onColorChange(color)
                  setShowColorPicker(false)
                }}
                onClose={() => setShowColorPicker(false)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}