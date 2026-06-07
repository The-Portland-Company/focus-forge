import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Focus: Forge",
  description:
    "Privacy Policy for Focus: Forge, a task, project, and email management app by The Portland Company.",
};

const LAST_UPDATED = "June 7, 2026";
const CONTACT_EMAIL = "spencerdhill@protonmail.com";

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-[#0E0F16] text-gray-200">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <header className="mb-10 border-b border-white/10 pb-8">
          <p className="text-sm font-medium uppercase tracking-widest text-indigo-400">
            Focus: Forge
          </p>
          <h1 className="mt-2 text-4xl font-bold text-white">Privacy Policy</h1>
          <p className="mt-3 text-sm text-gray-400">
            Last updated: {LAST_UPDATED}
          </p>
        </header>

        <div className="space-y-8 leading-relaxed text-gray-300">
          <section>
            <p>
              Focus: Forge (&ldquo;the App&rdquo;, &ldquo;we&rdquo;,
              &ldquo;us&rdquo;) is a task, project, and email management
              application published by The Portland Company. This Privacy Policy
              explains what information we collect, how we use it, and the
              choices you have. We are committed to protecting your privacy and
              handling your data responsibly.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-semibold text-white">
              Information We Collect
            </h2>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <span className="font-medium text-white">Account email.</span>{" "}
                When you create an account we collect your email address to
                identify you, authenticate your sessions, and send essential
                service communications.
              </li>
              <li>
                <span className="font-medium text-white">
                  Task and project content.
                </span>{" "}
                Tasks, projects, notes, estimates, comments, and related content
                you create are stored so the App can display and organize them
                for you.
              </li>
              <li>
                <span className="font-medium text-white">
                  Connected mailbox content.
                </span>{" "}
                If you connect an email mailbox, we access the email content from
                that mailbox in order to display your messages within the App and
                to power AI-assisted features such as drafting, summarizing, and
                triage.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-semibold text-white">
              How We Use Your Information
            </h2>
            <ul className="list-disc space-y-2 pl-6">
              <li>To provide, operate, and maintain the App&rsquo;s features.</li>
              <li>
                To display your tasks, projects, and connected mailbox messages.
              </li>
              <li>
                To power AI-assisted features (for example, reply drafting,
                summarization, and prioritization) on the content you choose to
                provide.
              </li>
              <li>
                To authenticate you, secure your account, and communicate about
                the service.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-semibold text-white">
              Data Storage and Security
            </h2>
            <p>
              Your data is stored using Supabase, our hosting and database
              provider, and is protected with industry-standard access controls
              and encryption in transit. We restrict access to your data to what
              is necessary to operate and support the App.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-semibold text-white">
              We Do Not Sell Your Data
            </h2>
            <p>
              We do not sell, rent, or trade your personal information. We do not
              use your task, project, or mailbox content for advertising. Your
              content is used only to provide the features you request.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-semibold text-white">
              Third-Party Services
            </h2>
            <p>
              We rely on a limited set of trusted service providers to operate
              the App, including Supabase for data storage and authentication and
              AI providers used to deliver AI-assisted features. These providers
              process data only as needed to perform their services for us and
              are bound by their own terms and privacy commitments.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-semibold text-white">
              Your Choices and Rights
            </h2>
            <p>
              You may disconnect a connected mailbox at any time, edit or delete
              your tasks and projects, and request deletion of your account and
              associated data. To make a data request, contact us at the address
              below.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-semibold text-white">
              Children&rsquo;s Privacy
            </h2>
            <p>
              The App is not directed to children under 13, and we do not
              knowingly collect personal information from children.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-semibold text-white">
              Changes to This Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. When we do, we
              will revise the &ldquo;Last updated&rdquo; date above. Continued use
              of the App after changes take effect constitutes acceptance of the
              updated policy.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-semibold text-white">Contact Us</h2>
            <p>
              If you have any questions about this Privacy Policy or your data,
              contact us at{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-indigo-400 underline underline-offset-4 hover:text-indigo-300"
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </section>
        </div>

        <footer className="mt-12 border-t border-white/10 pt-6 text-sm text-gray-500">
          <Link href="/support" className="text-indigo-400 hover:text-indigo-300">
            Support
          </Link>
          <span className="mx-2">·</span>
          <span>© {new Date().getFullYear()} The Portland Company</span>
        </footer>
      </div>
    </main>
  );
}
