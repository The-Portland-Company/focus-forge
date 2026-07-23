"use client";

type FloatingFieldLabelProps = {
  label: string;
};

export function FloatingFieldLabel({ label }: FloatingFieldLabelProps) {
  return (
    <span className="pointer-events-none absolute left-3 top-0 z-20 inline-flex -translate-y-1/2 items-center rounded border border-zinc-800 bg-zinc-950 px-2 py-0.5 text-xs sm:text-[11px] font-medium leading-none text-zinc-500">
      {label}
    </span>
  );
}
