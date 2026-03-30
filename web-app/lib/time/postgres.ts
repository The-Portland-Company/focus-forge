import postgres from "postgres";

let client: postgres.Sql | null = null;

function resolveProjectRef() {
  if (process.env.SUPABASE_PROJECT_REF) {
    return process.env.SUPABASE_PROJECT_REF;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) {
    return null;
  }

  try {
    const hostname = new URL(url).hostname;
    return hostname.split(".")[0] || null;
  } catch {
    return null;
  }
}

export function getTimePostgresClient() {
  if (client) {
    return client;
  }

  const projectRef = resolveProjectRef();
  const usePooler = process.env.SUPABASE_DB_USE_POOLER !== "false";
  const host =
    process.env.SUPABASE_DB_HOST ||
    (projectRef && usePooler ? "aws-0-us-west-2.pooler.supabase.com" : null) ||
    (projectRef ? `db.${projectRef}.supabase.co` : null);
  const password = process.env.SUPABASE_DB_PASSWORD;
  const username =
    process.env.SUPABASE_DB_USER ||
    (projectRef && usePooler ? `postgres.${projectRef}` : "postgres");
  const port = Number(process.env.SUPABASE_DB_PORT || (usePooler ? 6543 : 5432));

  if (!host || !password) {
    throw new Error("Missing Supabase database connection settings.");
  }

  client = postgres({
    host,
    port,
    database: process.env.SUPABASE_DB_NAME || "postgres",
    username,
    password,
    ssl: "require",
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
    prepare: false,
  });

  return client;
}
