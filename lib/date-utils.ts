/**
 * Get a local date string in YYYY-MM-DD format without timezone conversion
 */
export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Parse a date string and set time to start of day in local timezone
 */
export function getStartOfDay(dateString: string): Date {
  // Parse the date components to avoid timezone issues
  const [year, month, day] = dateString.split('-').map(Number)
  // Create date using local timezone (month is 0-indexed)
  const date = new Date(year, month - 1, day, 0, 0, 0, 0)
  return date
}

/**
 * Check if a date string represents today in local timezone
 */
export function isToday(dateString: string): boolean {
  const todayStr = getLocalDateString()
  return dateString === todayStr
}

/**
 * Check if a date string is before today in local timezone
 */
export function isOverdue(dateString: string): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const taskDate = getStartOfDay(dateString)
  return taskDate.getTime() < today.getTime()
}

/**
 * Check if a date string is today or before in local timezone
 */
export function isTodayOrOverdue(dateString: string): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const taskDate = getStartOfDay(dateString)
  return taskDate.getTime() <= today.getTime()
}

/**
 * Check if a date string represents tomorrow in local timezone
 */
export function isTomorrow(dateString: string): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const taskDate = getStartOfDay(dateString)
  return taskDate.getTime() === tomorrow.getTime()
}

/**
 * Check if a date string is within rest of the week (after tomorrow, up to end of week)
 * Week ends on Sunday
 */
export function isRestOfWeek(dateString: string): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  // Get end of week (Sunday)
  const endOfWeek = new Date(today)
  const daysUntilSunday = 7 - today.getDay()
  endOfWeek.setDate(endOfWeek.getDate() + daysUntilSunday)
  endOfWeek.setHours(23, 59, 59, 999)

  const taskDate = getStartOfDay(dateString)

  // After tomorrow and before or on end of week
  return taskDate.getTime() > tomorrow.getTime() && taskDate.getTime() <= endOfWeek.getTime()
}

/**
 * Check if a date is within the upcoming week (today through end of week)
 */
export function isWithinWeek(dateString: string): boolean {
  return isOverdue(dateString) || isToday(dateString) || isTomorrow(dateString) || isRestOfWeek(dateString)
}