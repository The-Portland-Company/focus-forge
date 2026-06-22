import type { Metadata } from "next"
import { LegalPage } from "@/components/LegalPage"
import { SITE } from "@/lib/site"

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `The terms that govern your use of ${SITE.name}.`,
  alternates: { canonical: "/terms/" },
}

export default function Terms() {
  return (
    <LegalPage title="Terms of Service" updated="June 2026">
      <p>
        These Terms govern your use of {SITE.name}, provided by {SITE.company}. By
        using the service, you agree to them.
      </p>
      <h2>Use of the service</h2>
      <p>
        Use {SITE.name} lawfully and don&rsquo;t attempt to disrupt or abuse it. You
        are responsible for the content you create.
      </p>
      <h2>Availability</h2>
      <p>
        We work to keep {SITE.name} available and reliable but provide it on an
        &ldquo;as is&rdquo; basis without warranties.
      </p>
      <h2>Contact</h2>
      <p>
        Questions? Email <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.
      </p>
    </LegalPage>
  )
}
