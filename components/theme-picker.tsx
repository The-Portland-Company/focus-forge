"use client"

import { useState, useEffect } from 'react'
import { Check } from 'lucide-react'

interface ThemePickerProps {
  onThemeChange: (theme: string) => void
  currentTheme?: string
}

const solidColors = [
  { name: 'Orange', value: '#EA580C' },
  { name: 'Red', value: '#DC2626' },
  { name: 'Pink', value: '#DB2777' },
  { name: 'Purple', value: '#9333EA' },
  { name: 'Blue', value: '#2563EB' },
  { name: 'Cyan', value: '#0891B2' },
  { name: 'Green', value: '#16A34A' },
  { name: 'Yellow', value: '#CA8A04' },
  { name: 'Gray', value: '#6B7280' },
]

const gradients = [
  { name: 'Sunset', value: 'linear-gradient(135deg, #FF6B6B 0%, #FFE66D 100%)' },
  { name: 'Ocean', value: 'linear-gradient(135deg, #667EEA 0%, #764BA2 100%)' },
  { name: 'Forest', value: 'linear-gradient(135deg, #56AB2F 0%, #A8E063 100%)' },
  { name: 'Lavender', value: 'linear-gradient(135deg, #E100FF 0%, #7F00FF 100%)' },
  { name: 'Fire', value: 'linear-gradient(135deg, #FF512F 0%, #F09819 100%)' },
  { name: 'Sky', value: 'linear-gradient(135deg, #00D2FF 0%, #3A7BD5 100%)' },
  { name: 'Rose', value: 'linear-gradient(135deg, #FF61D2 0%, #FE9090 100%)' },
  { name: 'Mint', value: 'linear-gradient(135deg, #11998E 0%, #38EF7D 100%)' },
  { name: 'Peach', value: 'linear-gradient(135deg, #FFECD2 0%, #FCB69F 100%)' },
  { name: 'Aurora', value: 'linear-gradient(135deg, #00F260 0%, #0575E6 100%)' },
  { name: 'Berry', value: 'linear-gradient(135deg, #8E2DE2 0%, #4A00E0 100%)' },
  { name: 'Coral', value: 'linear-gradient(135deg, #FA709A 0%, #FEE140 100%)' },
]

export function ThemePicker({ onThemeChange, currentTheme = solidColors[0].value }: ThemePickerProps) {
  const [selectedTheme, setSelectedTheme] = useState(currentTheme)

  useEffect(() => {
    setSelectedTheme(currentTheme)
  }, [currentTheme])

  const handleThemeSelect = (theme: string) => {
    setSelectedTheme(theme)
    onThemeChange(theme)
  }

  return (
    <div className="w-64 p-4 bg-zinc-800 rounded-lg shadow-xl">
      <div className="mb-4">
        <h3 className="text-sm font-medium text-zinc-300 mb-3">Solid Colors</h3>
        <div className="grid grid-cols-3 gap-2">
          {solidColors.map((color) => (
            <button
              key={color.name}
              onClick={() => handleThemeSelect(color.value)}
              className="relative w-full h-10 rounded-md transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-zinc-800 ring-theme"
              style={{ backgroundColor: color.value }}
              title={color.name}
            >
              {selectedTheme === color.value && (
                <Check className="absolute inset-0 m-auto w-5 h-5 text-white drop-shadow-md" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-zinc-300 mb-3">Gradients</h3>
        <div className="grid grid-cols-3 gap-2">
          {gradients.map((gradient) => (
            <button
              key={gradient.name}
              onClick={() => handleThemeSelect(gradient.value)}
              className="relative w-full h-10 rounded-md transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-zinc-800 ring-theme"
              style={{ background: gradient.value }}
              title={gradient.name}
            >
              {selectedTheme === gradient.value && (
                <Check className="absolute inset-0 m-auto w-5 h-5 text-white drop-shadow-md" />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}