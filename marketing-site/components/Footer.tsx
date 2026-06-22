import Link from "next/link"
import { SITE } from "@/lib/site"

export function Footer() {
  return (
    <footer className="border-t border-border bg-card/40">
      <div className="mx-auto max-w-6xl px-5 py-12">
        <div className="flex flex-col items-start justify-between gap-8 md:flex-row">
          <div className="max-w-sm">
            <div className="flex items-center gap-2 font-semibold">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg brand-gradient text-xs font-bold text-white">
                FF
              </span>
              {SITE.name}
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{SITE.description}</p>
          </div>
          <div className="grid grid-cols-2 gap-10 text-sm">
            <div>
              <div className="mb-3 font-medium">Product</div>
              <ul className="space-y-2 text-muted-foreground">
                <li><Link href="/#features" className="hover:text-foreground no-underline-link">Features</Link></li>
                <li><Link href="/#autonomous" className="hover:text-foreground no-underline-link">Autonomous loop</Link></li>
                <li><Link href="/#devnotes" className="hover:text-foreground no-underline-link">DevNotes</Link></li>
                <li><Link href="/#platforms" className="hover:text-foreground no-underline-link">Platforms</Link></li>
              </ul>
            </div>
            <div>
              <div className="mb-3 font-medium">Legal</div>
              <ul className="space-y-2 text-muted-foreground">
                <li><Link href="/privacy/" className="hover:text-foreground no-underline-link">Privacy</Link></li>
                <li><Link href="/terms/" className="hover:text-foreground no-underline-link">Terms</Link></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>© {SITE.company}. All rights reserved.</span>
          <span>Built in Portland, Oregon.</span>
        </div>
      </div>
    </footer>
  )
}
