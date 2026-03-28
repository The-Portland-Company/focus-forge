import Link from "next/link";
import { FOCUS_TIME_OPENAPI_YAML } from "@/lib/time/openapi";

export const dynamic = "force-static";

export default function FocusTimeOpenApiDocsPage() {
  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">Docs</p>
          <h1 className="text-3xl font-semibold text-white">Focus: Time OpenAPI 3.1</h1>
          <p className="text-sm text-zinc-400">
            Public wire contract for Focus: Time clients, including auth expectations,
            bootstrap entities, and exact request and response shapes.
          </p>
          <div className="flex flex-wrap gap-3 text-xs">
            <Link
              href="/docs/focus-time-agent"
              className="rounded-full border border-zinc-700 px-3 py-1.5 text-zinc-200 hover:border-zinc-500 hover:text-white"
            >
              Agent Prompt
            </Link>
            <Link
              href="/api/v1/time/openapi"
              className="rounded-full border border-emerald-800/70 px-3 py-1.5 text-emerald-200 hover:border-emerald-600 hover:text-white"
            >
              JSON Envelope
            </Link>
          </div>
        </div>
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-6">
          <pre className="overflow-x-auto whitespace-pre text-sm leading-7 text-zinc-200">
            {FOCUS_TIME_OPENAPI_YAML}
          </pre>
        </div>
      </div>
    </main>
  );
}
