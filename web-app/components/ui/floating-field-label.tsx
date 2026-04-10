"use client";

type FloatingFieldLabelProps = {
  label: string;
};

export function FloatingFieldLabel({ label }: FloatingFieldLabelProps) {
  return (
    <span className="pointer-events-none absolute left-3 top-0 z-20 inline-flex -translate-y-1/2 items-center rounded border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-medium leading-none text-zinc-900 shadow-sm ring-1 ring-zinc-950/10 dark:bg-white dark:text-zinc-900">
      {label}
    </span>
  );
}
