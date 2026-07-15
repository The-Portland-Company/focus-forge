"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";

interface ColorWheelPickerProps {
  currentColor: string;
  /** Brand gradient string applied by the "Brand Default Gradient" button. */
  brandGradient?: string;
  onColorChange: (color: string) => void;
  onClose?: () => void;
  className?: string;
}

const DEFAULT_BRAND_GRADIENT =
  "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";

// Reuse the same preset palette as the simple color picker.
const SWATCHES = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#0ea5e9",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
  "#64748b",
  "#71717a",
];

function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

const WHEEL_SIZE = 176;

export function ColorWheelPicker({
  currentColor,
  brandGradient,
  onColorChange,
  onClose,
  className = "",
}: ColorWheelPickerProps) {
  const [mounted, setMounted] = useState(false);
  const [value, setValue] = useState(1); // HSV "V" (brightness) slider 0..1
  const wheelRef = useRef<HTMLDivElement>(null);

  // Drive the open animation on the next frame after mount.
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const pickFromWheel = (clientX: number, clientY: number) => {
    const el = wheelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const dx = clientX - rect.left - cx;
    const dy = clientY - rect.top - cy;
    const radius = Math.min(cx, cy);
    const dist = Math.min(Math.sqrt(dx * dx + dy * dy), radius);
    // Angle: 0deg at +x, clockwise. Convert to hue 0..360.
    let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (angle < 0) angle += 360;
    const saturation = radius === 0 ? 0 : dist / radius;
    onColorChange(hsvToHex(angle, saturation, value));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    pickFromWheel(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons !== 1) return;
    pickFromWheel(e.clientX, e.clientY);
  };

  const gradient = brandGradient || DEFAULT_BRAND_GRADIENT;

  return (
    <div
      className={
        "absolute z-50 origin-top-left rounded-xl border border-zinc-700 bg-zinc-800 p-4 shadow-2xl transition-all duration-150 ease-out " +
        (mounted ? "scale-100 opacity-100" : "scale-90 opacity-0") +
        (className ? ` ${className}` : "")
      }
      style={{ width: WHEEL_SIZE + 32 }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* HSV color wheel */}
      <div className="flex justify-center">
        <div
          ref={wheelRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          className="relative cursor-crosshair rounded-full"
          style={{
            width: WHEEL_SIZE,
            height: WHEEL_SIZE,
            background:
              "conic-gradient(red, magenta, blue, cyan, lime, yellow, red)",
          }}
        >
          {/* radial white->transparent overlay gives the saturation falloff */}
          <div
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{
              background:
                "radial-gradient(circle at center, #ffffff 0%, rgba(255,255,255,0) 70%)",
            }}
          />
          {/* brightness overlay */}
          <div
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{ background: "#000", opacity: 1 - value }}
          />
        </div>
      </div>

      {/* Brightness slider */}
      <div className="mt-3">
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(value * 100)}
          onChange={(e) => setValue(Number(e.target.value) / 100)}
          className="w-full accent-white"
          aria-label="Brightness"
        />
      </div>

      {/* Preset swatches */}
      <div className="mt-3 grid grid-cols-6 gap-2">
        {SWATCHES.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => {
              onColorChange(color);
            }}
            className={
              "h-7 w-7 rounded-full border-2 transition-all hover:scale-110 " +
              (currentColor === color ? "border-white" : "border-transparent")
            }
            style={{ backgroundColor: color }}
            title={color}
          />
        ))}
      </div>

      {/* Brand gradient */}
      <button
        type="button"
        onClick={() => {
          onColorChange(gradient);
          onClose?.();
        }}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm font-medium text-white shadow transition-transform hover:scale-[1.02]"
        style={{ background: gradient }}
      >
        <Sparkles className="h-4 w-4" />
        Brand Default Gradient
      </button>
    </div>
  );
}
