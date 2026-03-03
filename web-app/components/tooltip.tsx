import React, { useState, useRef, useEffect } from 'react'

interface TooltipProps {
  children: React.ReactNode
  content: string
  delay?: number
}

export function Tooltip({ children, content, delay = 0 }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const triggerRef = useRef<HTMLDivElement>(null)

  const showTooltip = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true)
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect()
        setPosition({
          top: rect.top + rect.height / 2,
          left: rect.right + 10
        })
      }
    }, delay)
  }

  const hideTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setIsVisible(false)
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        className="w-full"
      >
        {children}
      </div>
      {isVisible && (
        <div
          className="fixed z-50 px-2 py-1 text-xs text-white bg-zinc-800 rounded-md shadow-lg pointer-events-none whitespace-nowrap"
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
            transform: 'translateY(-50%)'
          }}
        >
          {content}
          <div
            className="absolute w-0 h-0 border-t-4 border-b-4 border-r-4 border-t-transparent border-b-transparent border-r-zinc-800"
            style={{
              left: '-4px',
              top: '50%',
              transform: 'translateY(-50%)'
            }}
          />
        </div>
      )}
    </>
  )
}