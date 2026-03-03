"use client"

import { useEffect, useMemo, useState } from 'react'
import Lottie from 'lottie-react'
import { getBackgroundStyle } from '@/lib/style-utils'
import { getMemojiPath } from '@/lib/memoji'

const memojiCache = new Map<string, any>()

type UserAvatarProps = {
  name?: string | null
  profileColor?: string | null
  memoji?: string | null
  size?: number
  className?: string
  showFallback?: boolean
  ariaLabel?: string
}

export function UserAvatar({
  name,
  profileColor,
  memoji,
  size = 32,
  className = '',
  showFallback = true,
  ariaLabel
}: UserAvatarProps) {
  const [animationData, setAnimationData] = useState<any>(null)
  const [reducedMotion, setReducedMotion] = useState(false)

  const memojiPath = useMemo(() => getMemojiPath(memoji), [memoji])

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(media.matches)
    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    let isActive = true
    if (!memojiPath) {
      setAnimationData(null)
      return () => {
        isActive = false
      }
    }

    if (memojiCache.has(memojiPath)) {
      setAnimationData(memojiCache.get(memojiPath))
      return () => {
        isActive = false
      }
    }

    const loadMemoji = async () => {
      try {
        const response = await fetch(memojiPath)
        if (!response.ok) return
        const data = await response.json()
        memojiCache.set(memojiPath, data)
        if (isActive) {
          setAnimationData(data)
        }
      } catch (error) {
        console.error('Failed to load memoji animation:', error)
      }
    }

    loadMemoji()

    return () => {
      isActive = false
    }
  }, [memojiPath])

  const initial = useMemo(() => {
    const trimmed = (name || '').trim()
    if (!trimmed) return 'U'
    return trimmed.charAt(0).toUpperCase()
  }, [name])

  const wrapperStyle = {
    width: `${size}px`,
    height: `${size}px`
  }

  return (
    <span
      className={`rounded-full overflow-hidden inline-flex items-center justify-center ${className}`}
      style={wrapperStyle}
      role="img"
      aria-label={ariaLabel || name || 'User avatar'}
    >
      {animationData ? (
        <Lottie
          animationData={animationData}
          loop
          autoplay={!reducedMotion}
          style={{ width: '100%', height: '100%' }}
        />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center text-white font-medium"
          style={getBackgroundStyle(profileColor || undefined)}
        >
          {showFallback ? initial : null}
        </div>
      )}
    </span>
  )
}
