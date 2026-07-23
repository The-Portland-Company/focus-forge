"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";

interface TooltipProps {
  children: React.ReactNode;
  content: string;
  delay?: number;
  className?: string;
  side?: "right" | "bottom" | "top";
  align?: "center" | "start" | "end";
}

/**
 * Touch-friendly tooltip primitive.
 *
 * The original tooltip only listened for `mouseenter`/`mouseleave`, so on
 * touch devices (which have no hover) the tooltip never appeared. This version
 * keeps the exact same visual + prop API but opens on:
 *   - hover (`mouseenter`/`mouseleave`) for fine-pointer / desktop,
 *   - focus (`focusin`/`focusout`) for keyboard navigation, and
 *   - tap (`click`) which toggles on coarse pointers (touch), plus an outside
 *     tap / Escape to dismiss.
 *
 * The trigger wrapper is made focusable (`tabIndex=0`, `role`/`aria` wiring) so
 * keyboard and screen-reader users can reach it. Desktop hover is unchanged.
 */
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
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipId = React.useId();

  const computePosition = useCallback(() => {
    if (!triggerRef.current) return;
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
        : side === "top"
          ? {
              top: rect.top - 10,
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
  }, [side, align]);

  const showTooltip = useCallback(
    (immediate = false) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      const reveal = () => {
        computePosition();
        setIsVisible(true);
      };
      if (immediate || delay === 0) {
        reveal();
      } else {
        timeoutRef.current = setTimeout(reveal, delay);
      }
    },
    [computePosition, delay],
  );

  const hideTooltip = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsVisible(false);
  }, []);

  // Tap toggles the tooltip (primary affordance on touch / coarse pointers).
  const toggleTooltip = useCallback(() => {
    if (isVisible) {
      hideTooltip();
    } else {
      showTooltip(true);
    }
  }, [isVisible, hideTooltip, showTooltip]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // While open, dismiss on outside tap, Escape, scroll, or resize so the
  // tap-to-open flow on touch devices has a way to close.
  useEffect(() => {
    if (!isVisible) return;

    const onPointerDown = (e: PointerEvent) => {
      if (
        triggerRef.current &&
        e.target instanceof Node &&
        !triggerRef.current.contains(e.target)
      ) {
        hideTooltip();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") hideTooltip();
    };
    const onReflow = () => hideTooltip();

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
    };
  }, [isVisible, hideTooltip]);

  return (
    <>
      <div
        ref={triggerRef}
        tabIndex={0}
        role="button"
        aria-describedby={isVisible ? tooltipId : undefined}
        onMouseEnter={() => showTooltip()}
        onMouseLeave={hideTooltip}
        onFocus={() => showTooltip(true)}
        onBlur={hideTooltip}
        onClick={toggleTooltip}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleTooltip();
          }
        }}
        className={className}
      >
        {children}
      </div>
      {isVisible && (
        <div
          id={tooltipId}
          role="tooltip"
          className={
            "fixed z-50 rounded-md px-2 py-1 text-xs shadow-lg pointer-events-none border border-white/10 " +
            (side === "right"
              ? "max-w-[320px] whitespace-normal break-words"
              : "whitespace-nowrap")
          }
          style={{
            // The tooltip surface is always a dark gradient pill in BOTH light
            // and dark themes, so its text must always stay light. We set the
            // color inline (instead of the `text-white` utility) because the
            // global light-mode remap flips `.text-white` to near-black, which
            // made tooltips illegible (dark text on the dark pill) in Light Mode.
            // Neutral dark pill in both themes (not the brand gradient), light
            // text — a standard black/white tooltip.
            color: "#fafafa", // zinc-50
            top: `${position.top}px`,
            left: `${position.left}px`,
            transform:
              side === "bottom"
                ? align === "start"
                  ? "translateX(0)"
                  : align === "end"
                    ? "translateX(-100%)"
                    : "translateX(-50%)"
                : side === "top"
                  ? align === "start"
                    ? "translate(-0, -100%)"
                    : align === "end"
                      ? "translate(-100%, -100%)"
                      : "translate(-50%, -100%)"
                  : "translateY(-50%)",
            backgroundColor: "rgba(10, 10, 11, 0.97)",
          }}
        >
          {content}
          <div
            className={
              side === "bottom"
                ? "absolute h-0 w-0 border-b-4 border-l-4 border-r-4 border-b-[#0a0a0b] border-l-transparent border-r-transparent"
                : side === "top"
                  ? "absolute h-0 w-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-[#0a0a0b]"
                  : "absolute h-0 w-0 border-b-4 border-r-4 border-t-4 border-b-transparent border-r-[#0a0a0b] border-t-transparent"
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
                : side === "top"
                  ? {
                      left:
                        align === "start"
                          ? "12px"
                          : align === "end"
                            ? "calc(100% - 12px)"
                            : "50%",
                      bottom: "-4px",
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
