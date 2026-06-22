import { Apple, Globe, Laptop } from "lucide-react"

const PLATFORMS = [
  { icon: Globe, title: "Web", body: "The full app in any modern browser. Nothing to install." },
  { icon: Apple, title: "iOS", body: "A native iPhone app for capturing and checking off on the go." },
  { icon: Laptop, title: "macOS", body: "A native Mac app with a dock badge for what's due today." },
]

export function Platforms() {
  return (
    <section id="platforms" className="border-t border-border bg-card/40 py-20">
      <div className="mx-auto max-w-6xl px-5 text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Everywhere you work</h2>
        <p className="mx-auto mt-4 max-w-xl text-pretty text-muted-foreground">
          One account, synced across web, iOS, and macOS.
        </p>
        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          {PLATFORMS.map((p) => (
            <div key={p.title} className="rounded-xl border border-border bg-background p-8">
              <p.icon className="mx-auto h-8 w-8 text-[rgb(var(--theme-primary-rgb))]" />
              <h3 className="mt-4 text-lg font-semibold">{p.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
