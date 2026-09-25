// Registry of external systems that can create Forge tasks through the
// mobile API using a TPC Auth OAuth client (see lib/mobile/api.ts). `source`
// on a task is always derived server-side from the authenticated client id —
// never trusted from a request body — so this map is the single place that
// binds a TPC client id to a display source.

export type TaskSource = {
  label: string;
  logo: string;
  initials: string;
};

export const TASK_SOURCES: Record<string, TaskSource> = {
  "swarm-tester": {
    label: "Swarm Tester",
    logo: "/integrations/swarm-tester.svg",
    initials: "ST",
  },
};

// TPC Auth OAuth client id -> task source key.
export const TPC_CLIENT_SOURCE: Record<string, string> = {
  "swarm-tester-focus-forge": "swarm-tester",
};

export const sourceForTpcClientId = (
  clientId: string | null | undefined,
): string | null => {
  if (!clientId) return null;
  return TPC_CLIENT_SOURCE[clientId] ?? null;
};

export const getTaskSource = (source: string | null | undefined): TaskSource | null => {
  if (!source) return null;
  return TASK_SOURCES[source] ?? null;
};
