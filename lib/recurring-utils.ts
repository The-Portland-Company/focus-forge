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
    // Not valid JSON — try to parse as Todoist text pattern
  }

  const lower = str.toLowerCase().trim()

  // Parse common Todoist recurring text patterns
  if (/^every\s+day/i.test(lower)) {
    const timeMatch = lower.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
    const time = timeMatch ? parseTimeString(timeMatch) : undefined
    return { frequency: 'daily', time }
  }

  if (/^every\s+week/i.test(lower) || /^weekly/i.test(lower)) {
    return { frequency: 'weekly', customPattern: str }
  }

  if (/^every\s+month/i.test(lower) || /^monthly/i.test(lower)) {
    return { frequency: 'monthly', customPattern: str }
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
 * Always returns today or a future date — never a past date.
 */
export function getNextDueDate(config: RecurringConfig, currentDueDate: string): string {
  const base = new Date(currentDueDate)
  if (isNaN(base.getTime())) {
    // Fallback: tomorrow
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    return formatDateISO(tomorrow)
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  let result: string

  switch (config.frequency) {
    case 'daily': {
      // If base is in the past, next occurrence is tomorrow
      const next = new Date(Math.max(base.getTime(), today.getTime()))
      next.setDate(next.getDate() + 1)
      result = formatDateISO(next)
      break
    }

    case 'weekly': {
      if (config.days && config.days.length > 0) {
        // Start from today if base is in the past
        const start = new Date(Math.max(base.getTime(), today.getTime()))
        result = nextWeekday(start, config.days)
      } else {
        const next = new Date(Math.max(base.getTime(), today.getTime()))
        next.setDate(next.getDate() + 7)
        result = formatDateISO(next)
      }
      break
    }

    case 'monthly': {
      const targetDay = config.dayOfMonth || base.getDate()
      let nextMonth = new Date(Math.max(base.getTime(), today.getTime()))
      nextMonth.setMonth(nextMonth.getMonth() + 1)
      const maxDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate()
      nextMonth.setDate(Math.min(targetDay, maxDay))
      result = formatDateISO(nextMonth)
      break
    }

    case 'custom':
    default: {
      const next = new Date(Math.max(base.getTime(), today.getTime()))
      next.setDate(next.getDate() + 1)
      result = formatDateISO(next)
      break
    }
  }

  // Safety: ensure result is never in the past
  const resultDate = new Date(result)
  if (resultDate < today) {
    today.setDate(today.getDate() + 1)
    return formatDateISO(today)
  }

  return result
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
 * Parse a time string from a Todoist pattern match like "5am", "10:30pm".
 */
function parseTimeString(match: RegExpMatchArray): string | undefined {
  let h = parseInt(match[1], 10)
  const m = match[2] || '00'
  const ampm = (match[3] || '').toLowerCase()
  if (ampm === 'pm' && h < 12) h += 12
  if (ampm === 'am' && h === 12) h = 0
  return `${String(h).padStart(2, '0')}:${m}`
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
