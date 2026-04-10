import React, { useState, useRef, useEffect } from "react";

interface TooltipProps {
  children: React.ReactNode;
  content: string;
  delay?: number;
  className?: string;
  side?: "right" | "bottom";
  align?: "center" | "start" | "end";
}

export function Tooltip({
  children,
  content,
  delay = 0,
  className = "w-full",
  side = "right",
  align = "center",
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const showTooltip = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setPosition(
          side === "bottom"
            ? {
                top: rect.bottom + 10,
                left:
                  align === "start"
                    ? rect.left
                    : align === "end"
                      ? rect.right
                      : rect.left + rect.width / 2,
              }
            : {
                top: rect.top + rect.height / 2,
                left: rect.right + 10,
              },
        );
      }
    }, delay);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        className={className}
      >
        {children}
      </div>
      {isVisible && (
        <div
          className="fixed z-50 px-2 py-1 text-xs text-white bg-zinc-800 rounded-md shadow-lg pointer-events-none whitespace-nowrap"
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
            transform:
              side === "bottom"
                ? align === "start"
                  ? "translateX(0)"
                  : align === "end"
                    ? "translateX(-100%)"
                    : "translateX(-50%)"
                : "translateY(-50%)",
          }}
        >
          {content}
          <div
            className={
              side === "bottom"
                ? "absolute h-0 w-0 border-b-4 border-l-4 border-r-4 border-b-zinc-800 border-l-transparent border-r-transparent"
                : "absolute h-0 w-0 border-b-4 border-r-4 border-t-4 border-b-transparent border-r-zinc-800 border-t-transparent"
            }
            style={{
              ...(side === "bottom"
                ? {
                    left:
                      align === "start"
                        ? "12px"
                        : align === "end"
                          ? "calc(100% - 12px)"
                          : "50%",
                    top: "-4px",
                    transform:
                      align === "center" ? "translateX(-50%)" : "none",
                  }
                : {
                    left: "-4px",
                    top: "50%",
                    transform: "translateY(-50%)",
                  }),
            }}
          />
        </div>
      )}
    </>
  );
}
