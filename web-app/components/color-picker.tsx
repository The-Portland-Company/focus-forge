"use client"

import { useState } from 'react'

interface ColorPickerProps {
  currentColor: string
  onColorChange: (color: string) => void
  onClose?: () => void
}

const COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#84cc16', // lime
  '#22c55e', // green
  '#10b981', // emerald
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#0ea5e9', // sky
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#a855f7', // purple
  '#d946ef', // fuchsia
  '#ec4899', // pink
  '#f43f5e', // rose
  '#64748b', // slate
  '#71717a', // zinc
]

export function ColorPicker({ currentColor, onColorChange, onClose }: ColorPickerProps) {
  return (
    <div className="absolute z-50 bg-zinc-800 border border-zinc-700 rounded-lg p-3 shadow-lg">
      <div className="grid grid-cols-6 gap-2">
        {COLORS.map(color => (
          <button
            key={color}
            onClick={() => {
              onColorChange(color)
              onClose?.()
            }}
            className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 ${
              currentColor === color ? 'border-white' : 'border-transparent'
            }`}
            style={{ backgroundColor: color }}
            title={color}
          />
        ))}
      </div>
    </div>
  )
}