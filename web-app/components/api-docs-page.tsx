"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Copy,
  FileCode2,
  KeyRound,
  Search,
} from "lucide-react";
import type { ApiAuthType, ApiDocsEntry } from "@/lib/api/docs/registry";
import type { ApiKeyMeta } from "@/lib/api/keys/types";

interface ApiDocsPageProps {
  entries: ApiDocsEntry[];
  isAuthenticated: boolean;
  personalAccessTokens: ApiKeyMeta[];
  organizationApiKeys: ApiKeyMeta[];
}

type PromptMode = {
  baseUrl: string;
  endpointPlaceholder: string;
  methodPlaceholder: string;
  auth: string;
  scopes: string;
  note: string;
};

const authBadgeClass: Record<ApiAuthType, string> = {
  public: "bg-emerald-900/40 text-emerald-300 border border-emerald-700/50",
  bearer: "bg-blue-900/40 text-blue-300 border border-blue-700/50",
  cookie_session: "bg-amber-900/40 text-amber-300 border border-amber-700/50",
  internal: "bg-zinc-800 text-zinc-300 border border-zinc-700",
};

const apiPromptTemplate: PromptMode = {
  baseUrl: "https://app.focus-forge.io",
  endpointPlaceholder: "{endpoint}",
  methodPlaceholder: "{method}",
  auth: "{auth}",
  scopes: "{scopes}",
  note:
    "Use this template as a machine-readable request prompt when asking an AI agent to execute a request against Focus Forge APIs.",
};

const formatDate = (value: string | null) => {
  if (!value) return "Not set";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return "Invalid date";
  return new Date(parsed).toLocaleString();
};

const isExpired = (value: string | null) => {
  if (!value) return true;
  return Date.parse(value) <= Date.now();
};

export function ApiDocsPage({
  entries,
  isAuthenticated,
  personalAccessTokens,
  organizationApiKeys,
}: ApiDocsPageProps) {
  const [query, setQuery] = useState("");
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;

    return entries.filter((entry) => {
      const haystack = [
        entry.path,
        entry.summary,
        entry.auth,
        ...entry.tags,
        ...entry.methods.map((m) => m.method),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [entries, query]);

  const hasMissingExpiration =
    personalAccessTokens.some((key) => !key.expiresAt || isNaN(Date.parse(key.expiresAt))) ||
    organizationApiKeys.some((key) => !key.expiresAt || isNaN(Date.parse(key.expiresAt)));

  const aiPrompt = `### Focus Forge API request for AI
- Action: {action}
- Base URL: ${`{base_url}`}
- Endpoint: ${apiPromptTemplate.endpointPlaceholder}
- Method: ${apiPromptTemplate.methodPlaceholder}
- Auth: ${apiPromptTemplate.auth}
- Scopes: ${apiPromptTemplate.scopes}
- Expected result: {result}

Required placeholders to keep while authoring the request:
- {base_url}
- {endpoint}
- {method}
- {auth}
- {result}

Use the same placeholders everywhere you construct requests:
${`{base_url}`}, ${`{endpoint}`}, ${`{method}`}, ${`{auth}`}.`;

  const keyRows = [
    ...personalAccessTokens.map((token) => ({
      ...token,
      label: "Personal Access Token",
      scope: `PAT • ${token.scopes.join(", ") || "read"}`,
      org: "Your account",
    })),
    ...organizationApiKeys.map((token) => ({
      ...token,
      label: "Organization API Key",
      scope: `Org • ${token.scopes.join(", ") || "read"}`,
      org: token.organizationId || "Unknown org",
    })),
  ];

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(aiPrompt);
      setCopiedPrompt(true);
      window.setTimeout(() => setCopiedPrompt(false), 2000);
    } catch {
      setCopiedPrompt(false);
    }
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Ignore copy failures in constrained environments.
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-8 md:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="space-y-3">
          <h1 className="text-2xl font-semibold tracking-tight">API Docs</h1>
          <p className="text-sm text-zinc-400">
            Public documentation for all current <code>/api/*</code> endpoints.
          </p>
          <div className="relative max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search path, method, tag, or auth..."
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 py-2 pl-9 pr-3 text-sm text-zinc-100 outline-none ring-0 transition focus:border-zinc-500"
            />
          </div>
        </div>

        <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium">AI Prompt Template</h2>
              <p className="text-sm text-zinc-400 mt-1">Version: 1.0</p>
            </div>
            <button
              type="button"
              onClick={copyPrompt}
              className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              <Copy className="h-3 w-3" />
              {copiedPrompt ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="overflow-x-auto rounded border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-300">
            {aiPrompt}
          </pre>
          <p className="text-xs text-zinc-500 mt-2">{apiPromptTemplate.note}</p>
        </section>

        <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium">Get started with API keys</h2>
              <p className="text-sm text-zinc-400 mt-1">
                Use token-based auth for third-party integrations.
              </p>
            </div>
            <Link
              href="/settings?section=api-keys"
              className="inline-flex items-center gap-2 rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800"
            >
              <KeyRound className="h-4 w-4" />
              Personal Access Tokens
            </Link>
          </div>

          <ol className="space-y-2 text-sm text-zinc-300 list-decimal pl-5">
            <li>
              <strong>Step 1:</strong> Sign in and create a PAT in settings with at least an
              expiration and read scope.
            </li>
            <li>
              <strong>Step 2:</strong> If you have APIs that represent teams/organizations,
              create Organization API Keys from the organization settings modal.
            </li>
            <li>
              <strong>Step 3:</strong> Use Authorization: Bearer with {`{api_key}`} in request headers.
            </li>
            <li>
              <strong>Step 4:</strong> Rotate keys periodically; revoke any compromised or old key.
            </li>
          </ol>

          {!isAuthenticated ? (
            <div className="rounded border border-amber-700/50 bg-amber-900/20 p-3 text-sm text-amber-200">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                <span>Sign in to generate and manage API keys.</span>
              </div>
            </div>
          ) : (
            <div className="rounded border border-zinc-700/70 bg-zinc-900 p-3 space-y-2">
              {hasMissingExpiration && (
                <p className="text-sm text-amber-300">
                  Some existing keys are missing valid expiration. Recreate those tokens with a future
                  expiration.
                </p>
              )}

              {keyRows.length === 0 ? (
                <div className="text-sm text-zinc-400">
                  No keys found yet. Open settings links above to create your first key.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {keyRows.map((key) => (
                    <div key={key.id} className="rounded border border-zinc-700 p-3">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="text-xs uppercase tracking-wide text-zinc-500">{key.label}</span>
                        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-300">
                          {key.scope}
                        </span>
                        {!key.isActive && (
                          <span className="rounded bg-red-900/40 px-1.5 py-0.5 text-[11px] text-red-300 border border-red-800/80">
                            Revoked
                          </span>
                        )}
                        {isExpired(key.expiresAt) && key.isActive && (
                          <span className="rounded bg-amber-900/40 px-1.5 py-0.5 text-[11px] text-amber-300 border border-amber-800/80">
                            Expired
                          </span>
                        )}
                      </div>
                      <p className="font-mono text-xs text-zinc-100">{key.maskedKey}</p>
                      <p className="text-xs text-zinc-500 mt-1">{key.name}</p>
                      <p className="text-xs text-zinc-500">Scope group: {key.org}</p>
                      <p className="text-xs text-zinc-500">
                        Created: {formatDate(key.createdAt)} · Expires: {formatDate(key.expiresAt)}
                      </p>
                      <div className="text-xs text-zinc-500 mt-2">
                        Last used: {formatDate(key.lastUsedAt)}
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => copyText(key.maskedKey || "")}
                          className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
                        >
                          Copy masked
                        </button>
                        <Link
                          href={
                            key.organizationId
                              ? `/settings?section=organization-api-keys&organizationId=${key.organizationId}`
                              : "/settings?section=api-keys"
                          }
                          className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
                        >
                          Open settings
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="space-y-3">
          {filtered.map((entry) => (
            <details
              key={entry.path}
              className="group rounded-lg border border-zinc-800 bg-zinc-900/60"
            >
              <summary className="cursor-pointer list-none px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="text-sm text-zinc-100">{entry.path}</code>
                  <span
                    className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${authBadgeClass[entry.auth]}`}
                  >
                    {entry.auth}
                  </span>
                  {entry.methods.map((method) => (
                    <span
                      key={`${entry.path}-${method.method}`}
                      className="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-300"
                    >
                      {method.method}
                    </span>
                  ))}
                  <span className="text-xs text-zinc-500">{entry.tags.join(" · ")}</span>
                </div>
                <p className="mt-1 text-xs text-zinc-400">{entry.summary}</p>
              </summary>

              <div className="space-y-4 border-t border-zinc-800 px-4 py-4">
                {entry.methods.map((method) => (
                  <div
                    key={`${entry.path}-${method.method}-details`}
                    className="rounded-md border border-zinc-800 bg-zinc-950/60 p-3"
                  >
                    <div className="mb-2 flex items-center gap-2 text-sm">
                      <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs font-semibold text-zinc-300">
                        {method.method}
                      </span>
                      <span className="text-zinc-300">{method.summary}</span>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <DocList title="Headers" values={method.request.headers} />
                      <DocList title="Query" values={method.request.query} />
                      <DocList title="Body" values={method.request.body} />
                    </div>

                    <div className="mt-3 space-y-2">
                      <div>
                        <p className="mb-1 text-xs uppercase tracking-wide text-zinc-500">
                          Success
                        </p>
                        <pre className="overflow-x-auto rounded border border-zinc-800 bg-zinc-900 p-2 text-xs text-zinc-300">
                          {method.responses.success}
                        </pre>
                      </div>
                      <div>
                        <p className="mb-1 text-xs uppercase tracking-wide text-zinc-500">
                          Errors
                        </p>
                        <pre className="overflow-x-auto rounded border border-zinc-800 bg-zinc-900 p-2 text-xs text-zinc-300">
                          {method.responses.errors.join("\n")}
                        </pre>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="mb-1 flex items-center justify-between">
                        <p className="text-xs uppercase tracking-wide text-zinc-500">Example</p>
                        <button
                          type="button"
                          onClick={() => copyText(method.exampleCurl)}
                          className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
                        >
                          <Copy className="h-3 w-3" />
                          Copy
                        </button>
                      </div>
                      <pre className="overflow-x-auto rounded border border-zinc-800 bg-zinc-900 p-2 text-xs text-zinc-300">
                        {method.exampleCurl}
                      </pre>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </section>

        {filtered.length === 0 && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-8 text-center text-zinc-400">
            <FileCode2 className="mx-auto mb-3 h-8 w-8 text-zinc-500" />
            No endpoints match your search.
          </div>
        )}
      </div>
    </div>
  );
}

function DocList({ title, values }: { title: string; values: string[] }) {
  return (
    <div>
      <p className="mb-1 text-xs uppercase tracking-wide text-zinc-500">{title}</p>
      {values.length === 0 ? (
        <p className="text-xs text-zinc-500">None</p>
      ) : (
        <ul className="space-y-1 text-xs text-zinc-300">
          {values.map((value, index) => (
            <li key={`${title}-${index}`} className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1">
              {value}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
