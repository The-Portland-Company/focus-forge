import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { CompareTable } from "@/components/CompareTable"
import { CtaBanner } from "@/components/CtaBanner"
import { COMPETITORS, FEATURE_ROWS } from "@/lib/compare"
import { SITE, SITE_URL } from "@/lib/site"

export const metadata: Metadata = {
  title: "Focus Forge alternatives compared",
  description: `See how ${SITE.name} compares to Todoist, TickTick, Things, and Motion — the only task manager with a built-in AI agent that runs your backlog.`,
  alternates: { canonical: "/compare/" },
  openGraph: {
    title: `Focus Forge vs. Todoist, TickTick, Things & Motion`,
    description: `How ${SITE.name} compares to the task managers people switch from.`,
    url: `${SITE_URL}/compare/`,
  },
}

export default function ComparePage() {
  return (
    <>
      <Header />
      <main>
        <section className="px-5 pt-20 pb-14">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-medium uppercase tracking-widest text-[rgb(var(--theme-primary-rgb))]">
              Comparisons
            </p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
              The best Focus Forge alternatives, compared
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-pretty text-muted-foreground">
              Most task managers help you organize work by hand. Focus Forge adds
              a built-in AI agent that creates, edits, and completes tasks — and
              can run autonomous loops against your whole backlog. Here&rsquo;s how
              it stacks up against the tools people usually switch from.
            </p>
          </div>
        </section>

        <section className="px-5 pb-16">
          <div className="mx-auto max-w-5xl rounded-2xl border border-border bg-card/40 p-4 sm:p-8">
            <CompareTable
              rows={FEATURE_ROWS}
              competitors={COMPETITORS.map((c) => ({
                slug: c.slug,
                name: c.name,
              }))}
            />
          </div>
        </section>

        <section className="px-5 pb-8">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-2xl font-semibold tracking-tight">
              Compare head-to-head
            </h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {COMPETITORS.map((c) => (
                <Link
                  key={c.slug}
                  href={`/compare/${c.slug}/`}
                  className="group rounded-xl border border-border bg-card p-6 transition-colors hover:border-[rgb(var(--theme-primary-rgb))] no-underline-link"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">
                      Focus Forge vs. {c.name}
                    </h3>
                    <ArrowRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{c.gap}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <CtaBanner />
      </main>
      <Footer />
    </>
  )
}
