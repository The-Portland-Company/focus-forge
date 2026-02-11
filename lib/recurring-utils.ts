import type { RecurringConfig } from '@/lib/types'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * Parse a recurring_pattern string into a RecurringConfig.
 * Handles JSON configs and legacy free-text strings (Todoist imports).
 */
export function parseRecurringPattern(str: string | null | undefined): RecurringConfig | null {
  if (!str || !str.trim()) return null

  try {
    const parsed = JSON.parse(str)
    if (parsed && typeof parsed === 'object' && parsed.frequency) {
      return parsed as RecurringConfig
    }
  } catch {
    // Not valid JSON — treat as legacy free-text
  }

  return { frequency: 'custom', customPattern: str }
}

/**
 * Serialize a RecurringConfig to a string for storage.
 * Returns undefined if config is null/empty (clears the field).
 */
export function serializeRecurringConfig(config: RecurringConfig | null): string | undefined {
  if (!config) return undefined
  return JSON.stringify(config)
}

/**
 * Format a recurring pattern string into a human-readable label.
 */
export function formatRecurringLabel(str: string | null | undefined): string {
  const config = parseRecurringPattern(str)
  if (!config) return ''

  const timePart = config.time ? ` at ${formatTime12h(config.time)}` : ''

  switch (config.frequency) {
    case 'daily':
      return `Daily${timePart}`

    case 'weekly': {
      if (config.days && config.days.length > 0) {
        const dayLabels = config.days
          .sort((a, b) => a - b)
          .map(d => DAY_NAMES[d])
          .join(', ')
        return `Weekly: ${dayLabels}${timePart}`
      }
      return `Weekly${timePart}`
    }

    case 'monthly': {
      if (config.dayOfMonth) {
        return `Monthly on the ${ordinal(config.dayOfMonth)}${timePart}`
      }
      return `Monthly${timePart}`
    }

    case 'custom':
      return config.customPattern || 'Custom'

    default:
      return str || ''
  }
}

/**
 * Calculate the next due date given a recurring config and the current due date.
 */
export function getNextDueDate(config: RecurringConfig, currentDueDate: string): string {
  const base = new Date(currentDueDate)
  if (isNaN(base.getTime())) {
    // Fallback: tomorrow
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    return formatDateISO(tomorrow)
  }

  switch (config.frequency) {
    case 'daily': {
      base.setDate(base.getDate() + 1)
      return formatDateISO(base)
    }

    case 'weekly': {
      if (config.days && config.days.length > 0) {
        return nextWeekday(base, config.days)
      }
      // No specific days: +7 days
      base.setDate(base.getDate() + 7)
      return formatDateISO(base)
    }

    case 'monthly': {
      const targetDay = config.dayOfMonth || base.getDate()
      const nextMonth = new Date(base)
      nextMonth.setMonth(nextMonth.getMonth() + 1)
      // Clamp to month length
      const maxDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate()
      nextMonth.setDate(Math.min(targetDay, maxDay))
      return formatDateISO(nextMonth)
    }

    case 'custom':
    default: {
      // Fallback: +1 day
      base.setDate(base.getDate() + 1)
      return formatDateISO(base)
    }
  }
}

// --- helpers ---

function formatDateISO(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatTime12h(time: string): string {
  const [hStr, mStr] = time.split(':')
  let h = parseInt(hStr, 10)
  const m = mStr || '00'
  const ampm = h >= 12 ? 'PM' : 'AM'
  if (h === 0) h = 12
  else if (h > 12) h -= 12
  return `${h}:${m} ${ampm}`
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

/**
 * Find the next occurrence of one of the target weekdays after `base`.
 */
function nextWeekday(base: Date, days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b)
  const currentDay = base.getDay()

  // Look for the next matching day after today
  for (const d of sorted) {
    if (d > currentDay) {
      const diff = d - currentDay
      const next = new Date(base)
      next.setDate(next.getDate() + diff)
      return formatDateISO(next)
    }
  }

  // Wrap to next week — pick the first matching day
  const diff = 7 - currentDay + sorted[0]
  const next = new Date(base)
  next.setDate(next.getDate() + diff)
  return formatDateISO(next)
}
