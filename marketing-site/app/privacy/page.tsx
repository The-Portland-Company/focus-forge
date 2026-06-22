import type { Metadata } from "next"
import { LegalPage } from "@/components/LegalPage"
import { SITE } from "@/lib/site"

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${SITE.name} collects, uses, and protects your data.`,
  alternates: { canonical: "/privacy/" },
}

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="June 2026">
      <p>
        This Privacy Policy explains how {SITE.company} (&ldquo;we&rdquo;) handles
        information in connection with {SITE.name}. We collect only what we need to
        provide the service.
      </p>
      <h2>Information we collect</h2>
      <p>
        Account details (such as your email), the tasks and projects you create, and
        basic usage data needed to operate and improve the product.
      </p>
      <h2>How we use it</h2>
      <p>
        To provide and maintain {SITE.name}, secure your account, and respond to
        support requests. We do not sell your personal information.
      </p>
      <h2>Contact</h2>
      <p>
        Questions? Email <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.
      </p>
    </LegalPage>
  )
}
