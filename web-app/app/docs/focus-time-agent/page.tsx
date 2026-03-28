import Link from "next/link";
import { FOCUS_TIME_PROMPT_MARKDOWN } from "@/lib/time/prompt";

export const dynamic = "force-static";

export default function FocusTimeAgentDocsPage() {
  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">Docs</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">
            Focus: Time Agent Prompt
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Public implementation prompt for the separate Focus: Time iOS and macOS app.
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-xs">
            <Link
              href="/api/v1/time/prompt"
              className="rounded-full border border-zinc-700 px-3 py-1.5 text-zinc-200 hover:border-zinc-500 hover:text-white"
            >
              Prompt Endpoint
            </Link>
            <Link
              href="/docs/focus-time-openapi"
              className="rounded-full border border-emerald-800/70 px-3 py-1.5 text-emerald-200 hover:border-emerald-600 hover:text-white"
            >
              OpenAPI 3.1
            </Link>
            <Link
              href="/api/v1/time/openapi"
              className="rounded-full border border-zinc-700 px-3 py-1.5 text-zinc-200 hover:border-zinc-500 hover:text-white"
            >
              OpenAPI Endpoint
            </Link>
          </div>
        </div>
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-6">
          <pre className="whitespace-pre-wrap text-sm leading-7 text-zinc-200">
            {FOCUS_TIME_PROMPT_MARKDOWN}
          </pre>
        </div>
      </div>
    </main>
  );
}
