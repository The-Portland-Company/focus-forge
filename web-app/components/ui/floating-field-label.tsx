"use client";

type FloatingFieldLabelProps = {
  label: string;
};

export function FloatingFieldLabel({ label }: FloatingFieldLabelProps) {
  return (
    <span className="pointer-events-none absolute left-3 top-0 z-10 -translate-y-1/2 rounded px-2 text-[11px] font-medium text-white shadow-sm bg-zinc-950 dark:bg-zinc-950 bg-white dark:text-white text-zinc-900">
      {label}
    </span>
  );
}
