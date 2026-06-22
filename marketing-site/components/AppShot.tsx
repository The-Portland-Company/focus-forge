/* eslint-disable @next/next/no-img-element */

// Theme-aware app screenshot. Provide a dark and (optionally) light capture;
// the correct one shows based on the active theme. Falls back to the dark
// image if no light variant is supplied. A skeleton frame renders until the
// real captures are dropped into /public/media/screenshots.
export function AppShot({
  dark,
  light,
  alt,
  priority = false,
  className = "",
}: {
  dark: string
  light?: string
  alt: string
  priority?: boolean
  className?: string
}) {
  return (
    <div
      className={`overflow-hidden rounded-xl border border-border bg-card shadow-2xl ${className}`}
    >
      <img
        src={dark}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        className={`block w-full ${light ? "dark:block hidden" : "block"}`}
      />
      {light ? (
        <img
          src={light}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          className="block w-full dark:hidden"
        />
      ) : null}
    </div>
  )
}
