"use client"

import { X } from 'lucide-react'
import type { RecurringConfig } from '@/lib/types'
import { TimePicker } from '@/components/time-picker'

const FREQUENCIES: { value: RecurringConfig['frequency']; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'custom', label: 'Custom' },
]

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

interface RecurringPickerProps {
  value: RecurringConfig | null
  onChange: (config: RecurringConfig | null) => void
}

export function RecurringPicker({ value, onChange }: RecurringPickerProps) {
  const frequency = value?.frequency ?? null

  const setFrequency = (f: RecurringConfig['frequency']) => {
    if (frequency === f) return
    const base: RecurringConfig = { frequency: f }
    if (f === 'weekly') base.days = []
    if (f === 'monthly') base.dayOfMonth = new Date().getDate()
    if (f === 'custom') base.customPattern = value?.customPattern || ''
    if (value?.time) base.time = value.time
    onChange(base)
  }

  const toggleDay = (day: number) => {
    if (!value) return
    const current = value.days || []
    const next = current.includes(day)
      ? current.filter(d => d !== day)
      : [...current, day].sort((a, b) => a - b)
    onChange({ ...value, days: next })
  }

  const setDayOfMonth = (d: number) => {
    if (!value) return
    const clamped = Math.max(1, Math.min(31, d))
    onChange({ ...value, dayOfMonth: clamped })
  }

  const setCustomPattern = (text: string) => {
    if (!value) return
    onChange({ ...value, customPattern: text })
  }

  const setTime = (t: string) => {
    if (!value) return
    onChange({ ...value, time: t || undefined })
  }

  const clearAll = () => onChange(null)

  return (
    <div className="space-y-3">
      {/* Frequency pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {FREQUENCIES.map(f => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFrequency(f.value)}
            className={`px-3 py-1.5 rounded-full text-sm transition-all ${
              frequency === f.value
                ? 'bg-[rgb(var(--theme-primary-rgb))] text-white'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
            }`}
          >
            {f.label}
          </button>
        ))}

        {value && (
          <button
            type="button"
            onClick={clearAll}
            className="p-1.5 text-zinc-500 hover:text-white transition-colors"
            title="Clear recurrence"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Weekly: day chips */}
      {frequency === 'weekly' && (
        <div className="flex items-center gap-1.5">
          {DAY_LABELS.map((label, i) => {
            const selected = value?.days?.includes(i)
            return (
              <button
                key={i}
                type="button"
                onClick={() => toggleDay(i)}
                className={`w-8 h-8 rounded-full text-xs font-medium transition-all flex items-center justify-center ${
                  selected
                    ? 'bg-purple-500 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}

      {/* Monthly: day-of-month input */}
      {frequency === 'monthly' && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-400">Day of month:</span>
          <input
            type="number"
            min={1}
            max={31}
            value={value?.dayOfMonth ?? ''}
            onChange={e => setDayOfMonth(parseInt(e.target.value, 10) || 1)}
            className="w-16 bg-zinc-800 text-white text-sm px-2 py-1.5 rounded border border-zinc-700 focus:outline-none focus:ring-2 ring-theme"
          />
        </div>
      )}

      {/* Custom: free-text input */}
      {frequency === 'custom' && (
        <input
          type="text"
          value={value?.customPattern || ''}
          onChange={e => setCustomPattern(e.target.value)}
          placeholder="e.g., Every 2 weeks, Last Friday of month"
          className="w-full bg-zinc-800 text-white text-sm px-3 py-2 rounded-lg border border-zinc-700 focus:outline-none focus:ring-2 ring-theme placeholder:text-zinc-600"
        />
      )}

      {/* Optional time picker (shown for all frequencies except null) */}
      {value && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-400">Time:</span>
          <div className="flex-1 bg-zinc-800 rounded-lg border border-zinc-700">
            <TimePicker
              value={value.time || ''}
              onChange={setTime}
              placeholder="Optional"
              className="bg-transparent border-0 hover:bg-transparent focus:ring-0"
            />
          </div>
          {value.time && (
            <button
              type="button"
              onClick={() => setTime('')}
              className="text-zinc-500 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
