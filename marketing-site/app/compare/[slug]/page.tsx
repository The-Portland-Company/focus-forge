import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ArrowRight, Check } from "lucide-react"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { CompareTable } from "@/components/CompareTable"
import { CtaBanner } from "@/components/CtaBanner"
import { COMPETITORS, FEATURE_ROWS, getCompetitor } from "@/lib/compare"
import { APP_URL, SITE, SITE_URL } from "@/lib/site"

export const dynamicParams = false

export function generateStaticParams() {
  return COMPETITORS.map((c) => ({ slug: c.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const c = getCompetitor(slug)
  if (!c) return {}
  const title = `Focus Forge vs. ${c.name}`
  const description = `${c.name} ${c.tagline} See how ${SITE.name} compares — with a built-in AI agent that runs your backlog.`
  return {
    title,
    description,
    alternates: { canonical: `/compare/${c.slug}/` },
    openGraph: {
      title: `${title} — the AI-agent alternative`,
      description,
      url: `${SITE_URL}/compare/${c.slug}/`,
    },
  }
}

export default async function CompareCompetitorPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const c = getCompetitor(slug)
  if (!c) notFound()

  const others = COMPETITORS.filter((x) => x.slug !== c.slug)

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: `Is Focus Forge a good ${c.name} alternative?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `Yes. ${c.name} ${c.tagline} Focus Forge covers the same task and project management ground, then adds a built-in AI agent that can create, edit, and complete tasks and run autonomous loops against your backlog.`,
        },
      },
      {
        "@type": "Question",
        name: `What does Focus Forge do that ${c.name} doesn't?`,
        acceptedAnswer: { "@type": "Answer", text: c.gap },
      },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <Header />
      <main>
        <section className="px-5 pt-14 pb-12">
          <div className="mx-auto max-w-3xl">
            <Link
              href="/compare/"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground no-underline-link"
            >
              <ArrowLeft className="h-4 w-4" /> All comparisons
            </Link>
            <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">
              Focus Forge vs. {c.name}
            </h1>
            <p className="mt-5 text-pretty text-lg text-muted-foreground">
              {c.tagline} It&rsquo;s a solid choice for {c.goodAt.toLowerCase()}
            </p>
            <p className="mt-4 text-pretty text-muted-foreground">
              Where it stops: {c.gap}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href={APP_URL}
                className="inline-flex h-11 items-center gap-2 rounded-lg brand-gradient px-6 font-medium text-white transition-opacity hover:opacity-90 no-underline-link"
              >
                Try Focus Forge <ArrowRight className="h-4 w-4" />
              </a>
              <Link
                href="/#features"
                className="inline-flex h-11 items-center rounded-lg border border-border px-6 font-medium transition-colors hover:bg-card no-underline-link"
              >
                See features
              </Link>
            </div>
          </div>
        </section>

        <section className="px-5 pb-16">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-2xl font-semibold tracking-tight">
              Why teams switch from {c.name}
            </h2>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {c.wins.map((w) => (
                <div
                  key={w.title}
                  className="rounded-xl border border-border bg-card p-6"
                >
                  <Check className="h-6 w-6 text-emerald-500" />
                  <h3 className="mt-4 font-semibold">{w.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{w.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 pb-16">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-2xl font-semibold tracking-tight">
              Focus Forge vs. {c.name}, feature by feature
            </h2>
            <div className="mt-6 rounded-2xl border border-border bg-card/40 p-4 sm:p-8">
              <CompareTable
                rows={FEATURE_ROWS}
                competitors={[{ slug: c.slug, name: c.name }]}
                only={c.slug}
              />
            </div>
          </div>
        </section>

        <section className="px-5 pb-4">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-lg font-semibold text-muted-foreground">
              Compare other tools
            </h2>
            <div className="mt-4 flex flex-wrap gap-3">
              {others.map((o) => (
                <Link
                  key={o.slug}
                  href={`/compare/${o.slug}/`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:border-[rgb(var(--theme-primary-rgb))] no-underline-link"
                >
                  vs. {o.name}
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
