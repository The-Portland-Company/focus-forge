import { Header } from "@/components/Header"
import { Hero } from "@/components/Hero"
import { AutonomousSection } from "@/components/AutonomousSection"
import { FeatureGrid } from "@/components/FeatureGrid"
import { VideoShowcase } from "@/components/VideoShowcase"
import { DevNotes } from "@/components/DevNotes"
import { Platforms } from "@/components/Platforms"
import { Faq, FAQ_ITEMS } from "@/components/Faq"
import { CtaBanner } from "@/components/CtaBanner"
import { Footer } from "@/components/Footer"

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
}

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <Header />
      <main>
        <Hero />
        <AutonomousSection />
        <FeatureGrid />
        <VideoShowcase />
        <DevNotes />
        <Platforms />
        <Faq />
        <CtaBanner />
      </main>
      <Footer />
    </>
  )
}
