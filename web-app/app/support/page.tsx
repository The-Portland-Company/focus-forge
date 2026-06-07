import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Support — Focus: Forge",
  description:
    "Support and contact information for Focus: Forge, a task, project, and email management app by The Portland Company.",
};

const CONTACT_EMAIL = "spencerdhill@protonmail.com";

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-[#0E0F16] text-gray-200">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <header className="mb-10 border-b border-white/10 pb-8">
          <p className="text-sm font-medium uppercase tracking-widest text-indigo-400">
            Focus: Forge
          </p>
          <h1 className="mt-2 text-4xl font-bold text-white">Support</h1>
        </header>

        <div className="space-y-8 leading-relaxed text-gray-300">
          <section>
            <p>
              Focus: Forge is a task, project, and email management app by The
              Portland Company. It helps you organize your work, manage projects,
              and handle your email — with AI-assisted features to keep you
              focused and moving forward.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-semibold text-white">
              Get in Touch
            </h2>
            <p>
              Need help, found a bug, or have a feature request? We&rsquo;d love
              to hear from you. Reach our support team at{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-indigo-400 underline underline-offset-4 hover:text-indigo-300"
              >
                {CONTACT_EMAIL}
              </a>
              . We aim to respond within a few business days.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-semibold text-white">Privacy</h2>
            <p>
              Read about how we handle your data in our{" "}
              <Link
                href="/privacy"
                className="text-indigo-400 underline underline-offset-4 hover:text-indigo-300"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </section>
        </div>

        <footer className="mt-12 border-t border-white/10 pt-6 text-sm text-gray-500">
          © {new Date().getFullYear()} The Portland Company
        </footer>
      </div>
    </main>
  );
}
