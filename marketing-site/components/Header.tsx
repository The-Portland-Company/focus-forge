import Link from "next/link"
import { APP_URL, SITE } from "@/lib/site"
import { ThemeToggle } from "./ThemeToggle"

const NAV = [
  { href: "/#features", label: "Features" },
  { href: "/#autonomous", label: "Autonomous" },
  { href: "/#devnotes", label: "DevNotes" },
  { href: "/#platforms", label: "Platforms" },
  { href: "/compare/", label: "Compare" },
]

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2 font-semibold no-underline-link">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg brand-gradient text-sm font-bold text-primary-foreground">
            FF
          </span>
          <span>{SITE.name}</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="transition-colors hover:text-foreground no-underline-link">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle className="hidden sm:inline-flex" />
          <a
            href={APP_URL}
            className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors duration-fast ease-standard hover:bg-primary/90 no-underline-link"
          >
            Open app
          </a>
        </div>
      </div>
    </header>
  )
}
