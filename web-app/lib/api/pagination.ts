export function getPaginationParams(url: URL, defaultLimit = 100, maxLimit = 500) {
  const limitParam = url.searchParams.get('limit')
  const offsetParam = url.searchParams.get('offset')

  const limit = clampInt(limitParam, defaultLimit, 1, maxLimit)
  const offset = clampInt(offsetParam, 0, 0, Number.MAX_SAFE_INTEGER)

  return { limit, offset }
}

function clampInt(value: string | null, fallback: number, min: number, max: number) {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(parsed, min), max)
}
