export type MemojiOption = {
  id: string
  label: string
  path: string
}

export const MEMOJI_OPTIONS: MemojiOption[] = [
  { id: 'lol', label: 'LOL', path: '/memoji/lol.json' },
  { id: 'sup', label: 'Sup', path: '/memoji/sup.json' },
  { id: 'wth', label: 'Wth', path: '/memoji/wth.json' }
]

export const getMemojiPath = (memojiId: string | null | undefined) => {
  if (!memojiId) return null
  const match = MEMOJI_OPTIONS.find(option => option.id === memojiId)
  return match?.path || null
}
