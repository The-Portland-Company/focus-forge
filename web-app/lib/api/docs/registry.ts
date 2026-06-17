import fs from "node:fs/promises";
import path from "node:path";

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "OPTIONS"
  | "HEAD";

export type ApiAuthType = "public" | "cookie_session" | "bearer" | "internal";

export interface ApiRequestDoc {
  headers: string[];
  query: string[];
  body: string[];
}

export interface ApiResponseDoc {
  success: string;
  errors: string[];
}

export interface ApiMethodDoc {
  method: HttpMethod;
  summary: string;
  request: ApiRequestDoc;
  responses: ApiResponseDoc;
  exampleCurl: string;
}

export interface ApiDocsEntry {
  path: string;
  auth: ApiAuthType;
  summary: string;
  tags: string[];
  methods: ApiMethodDoc[];
}

type DiscoveredRoute = {
  path: string;
  methods: HttpMethod[];
};

const AUTH_HEADER = "Authorization: Bearer <token>";
const COOKIE_HEADER = "Cookie: sb-<project>-auth-token=<cookie>";
const JSON_HEADER = "Content-Type: application/json";

const HTTP_METHODS: HttpMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "HEAD",
];

const endpointOverrides: Record<
  string,
  Partial<Pick<ApiDocsEntry, "auth" | "summary" | "tags">>
> = {
  "/api/mobile/auth/apple": {
    auth: "public",
    summary: "Exchange Apple identity token for a Supabase session.",
    tags: ["mobile", "auth"],
  },
  "/api/mobile/auth/refresh": {
    auth: "public",
    summary: "Refresh a mobile session using refresh_token.",
    tags: ["mobile", "auth"],
  },
  "/api/mobile/auth/logout": {
    auth: "bearer",
    summary: "Revoke current mobile session token.",
    tags: ["mobile", "auth"],
  },
  "/api/mobile/account/link/verify": {
    auth: "bearer",
    summary: "Verify legacy email/password and return a short-lived link token.",
    tags: ["mobile", "auth", "account"],
  },
  "/api/mobile/account/link/complete": {
    auth: "bearer",
    summary: "Merge memberships/task ownership from a verified legacy account.",
    tags: ["mobile", "auth", "account"],
  },
  "/api/mobile/bootstrap": {
    auth: "bearer",
    summary:
      "Load mobile bootstrap snapshot (user, orgs, projects, today tasks). Accepts mobile access JWT or PAT bearer token.",
    tags: ["mobile", "tasks"],
  },
  "/api/mobile/tasks": {
    auth: "bearer",
    summary:
      "List/create mobile tasks. Accepts mobile access JWT or PAT bearer token.",
    tags: ["mobile", "tasks"],
  },
  "/api/mobile/tasks/{id}": {
    auth: "bearer",
    summary: "Update/delete a mobile task.",
    tags: ["mobile", "tasks"],
  },
  "/api/mobile/tasks/estimate": {
    auth: "bearer",
    summary:
      "AI task-time estimator. Returns predicted minutes for a single task, running through the user's configured estimator model waterfall (fallback chain). Accepts mobile access JWT or PAT bearer token (read/write/admin scope).",
    tags: ["mobile", "tasks", "ai"],
  },
  "/api/mobile/tasks/estimate/bulk": {
    auth: "bearer",
    summary:
      "AI task-time estimator (bulk). Estimates an inline array of tasks (up to 25), each through the user's configured estimator model waterfall. Accepts mobile access JWT or PAT bearer token (read/write/admin scope).",
    tags: ["mobile", "tasks", "ai"],
  },
  "/api/auth/login": {
    auth: "public",
    summary: "Login with email/password (web session cookies).",
    tags: ["auth"],
  },
  "/api/auth/register": {
    auth: "public",
    summary: "Create a new account.",
    tags: ["auth"],
  },
  "/api/auth/forgot-password": {
    auth: "public",
    summary: "Send a password reset email.",
    tags: ["auth"],
  },
  "/api/auth/logout": {
    auth: "public",
    summary: "Logout current web session.",
    tags: ["auth"],
  },
  "/api/calendar/feed": {
    auth: "public",
    summary: "Calendar feed endpoint secured via feed token in querystring.",
    tags: ["calendar"],
  },
  "/api/calendar/token": {
    auth: "cookie_session",
    summary: "Get or rotate current user's calendar feed token.",
    tags: ["calendar"],
  },
  "/api/keys/personal-access-tokens": {
    auth: "cookie_session",
    summary: "Manage personal access tokens for third-party API access.",
    tags: ["api-keys", "developer"],
  },
  "/api/keys/personal-access-tokens/{id}": {
    auth: "cookie_session",
    summary: "Revoke a specific personal access token.",
    tags: ["api-keys", "developer"],
  },
  "/api/organizations/{id}/api-keys": {
    auth: "cookie_session",
    summary: "Manage organization API keys for third-party integrations.",
    tags: ["api-keys", "organizations", "developer"],
  },
  "/api/organizations/{id}/api-keys/{keyId}": {
    auth: "cookie_session",
    summary: "Revoke a specific organization API key.",
    tags: ["api-keys", "organizations", "developer"],
  },
  "/api/v1/time/prompt": {
    auth: "public",
    summary: "Return the public Focus: Time implementation prompt in machine-readable form.",
    tags: ["time", "developer", "public"],
  },
  "/api/v1/time/openapi": {
    auth: "public",
    summary: "Return the public OpenAPI 3.1 contract for the Focus: Time API.",
    tags: ["time", "developer", "public"],
  },
  "/api/v1/time/bootstrap": {
    auth: "bearer",
    summary: "Load bootstrap data for the authenticated user's Focus: Time UI.",
    tags: ["time", "developer"],
  },
  "/api/v1/time/current": {
    auth: "bearer",
    summary: "Fetch the currently running timer for the authenticated user or org token context.",
    tags: ["time"],
  },
  "/api/v1/time/entries": {
    auth: "bearer",
    summary: "List or create time entries with org/project/task-list/task filters.",
    tags: ["time"],
  },
  "/api/v1/time/entries/{id}": {
    auth: "bearer",
    summary: "Fetch, update, or delete a specific time entry.",
    tags: ["time"],
  },
  "/api/v1/time/organizations/{organizationId}/groups": {
    auth: "bearer",
    summary: "List or create Focus: Time sharing groups for an organization.",
    tags: ["time", "organizations"],
  },
  "/api/v1/time/organizations/{organizationId}/tokens": {
    auth: "bearer",
    summary: "List or create Focus: Time organization API tokens.",
    tags: ["time", "api-keys", "organizations"],
  },
  "/api/v1/time/organizations/{organizationId}/tokens/{tokenId}": {
    auth: "bearer",
    summary: "Revoke a Focus: Time organization API token.",
    tags: ["time", "api-keys", "organizations"],
  },
  "/api/attachments/upload": {
    auth: "cookie_session",
    summary: "Upload an attachment.",
    tags: ["attachments"],
  },
  "/api/attachments/{id}": {
    auth: "cookie_session",
    summary: "Delete an attachment.",
    tags: ["attachments"],
  },
  "/api/users": {
    auth: "cookie_session",
    summary:
      "Create users over the API with either admin web session or admin-scoped personal access token (PAT).",
    tags: ["users", "admin", "developer"],
  },
};

const methodOverrides: Record<string, Partial<ApiMethodDoc>> = {
  "/api/users#POST": {
    summary:
      "Create a user account. Supports admin session auth or Bearer PAT with admin scope.",
    request: {
      headers: [JSON_HEADER, COOKIE_HEADER, AUTH_HEADER],
      query: [],
      body: [
        "email: string (required)",
        "firstName: string (optional)",
        "lastName: string (optional)",
        "role: team_member | admin | super_admin (optional, default team_member)",
        "organizationId: uuid (optional)",
        "bypassEmailConfirmation: boolean (optional, default false)",
        "sendPasswordReset: boolean (optional, default true)",
        "password: not allowed (server-generated password only)",
      ],
    },
    responses: {
      success:
        '201: {"user":{"id":"uuid","email":"user@example.com","role":"team_member","emailConfirmedAt":"timestamp|null","organizationId":"uuid|null"},"passwordResetEmailSent":true} | 200 (already exists): {"user":{"id":"uuid","email":"existing@example.com","role":"team_member","emailConfirmedAt":"timestamp|null","organizationId":"uuid|null"},"alreadyExists":true,"passwordResetEmailSent":false}',
      errors: [
        '{"error":{"code":"unauthorized","message":"Unauthorized"}}',
        '{"error":{"code":"forbidden","message":"PAT is missing required admin scope."}}',
        '{"error":{"code":"password_not_allowed","message":"Password must not be provided. Passwords are generated server-side."}}',
        '{"error":{"code":"invalid_email","message":"A valid email is required."}}',
      ],
    },
    exampleCurl: [
      "# Session admin call",
      'curl -X POST "<base-url>/api/users" \\',
      `  -H "${COOKIE_HEADER}" \\`,
      `  -H "${JSON_HEADER}" \\`,
      "  -d '{\"email\":\"new.user@example.com\",\"firstName\":\"New\",\"lastName\":\"User\",\"role\":\"team_member\",\"bypassEmailConfirmation\":true,\"sendPasswordReset\":true}'",
      "",
      "# PAT admin-scope call",
      'curl -X POST "<base-url>/api/users" \\',
      `  -H "Authorization: Bearer ff_pat_..." \\`,
      `  -H "${JSON_HEADER}"`,
      "  -d '{\"email\":\"new.user@example.com\",\"firstName\":\"New\",\"lastName\":\"User\",\"organizationId\":\"00000000-0000-0000-0000-000000000000\",\"bypassEmailConfirmation\":false,\"sendPasswordReset\":true}'",
    ].join("\n"),
  },
  "/api/mobile/tasks/estimate#POST": {
    summary:
      "Estimate how long a single task will take. Runs through the requesting user's configured estimator model waterfall (e.g. claude-opus-4-8 → gpt-4.1 → claude-sonnet-4-6 → grok-3), so it benefits from the full fallback chain. Accepts a mobile access JWT or a PAT bearer token (read/write/admin scope).",
    request: {
      headers: [JSON_HEADER, AUTH_HEADER],
      query: [],
      body: [
        "name: string (required) — task title",
        "description: string (optional)",
        "projectName: string (optional) — project/context name to bias the estimate",
        "context: string (optional) — alias for projectName",
        "tags: string[] (optional)",
        "priority: number (optional) — 1=urgent … 4=low",
        "dueInDays: number (optional) — days until due (negative = overdue)",
        "subtaskCount: number (optional)",
      ],
    },
    responses: {
      success:
        '200: {"data":{"minutes":45,"confidence":"high|med|low","rationale":"one short sentence|null","model":"claude-opus-4-8"},"meta":{},"error":null}',
      errors: [
        '{"data":null,"error":{"code":"validation_error","message":"Task name is required"}}',
        '{"data":null,"error":{"code":"invalid_access_token","message":"Access token is invalid or expired"}}',
        '{"data":null,"error":{"code":"insufficient_scope","message":"PAT is missing required scope"}}',
        '{"data":null,"error":{"code":"internal_error","message":"Failed to estimate task"}}',
      ],
    },
    exampleCurl: [
      'curl -X POST "<base-url>/api/mobile/tasks/estimate" \\',
      `  -H "Authorization: Bearer ff_pat_..." \\`,
      `  -H "${JSON_HEADER}" \\`,
      "  -d '{\"name\":\"Write release notes for v2.4\",\"description\":\"Summarize the 12 merged PRs\",\"projectName\":\"Mobile App\",\"priority\":2}'",
    ].join("\n"),
  },
  "/api/mobile/tasks/estimate/bulk#POST": {
    summary:
      "Estimate an inline array of tasks (up to 25) in one call. Each task runs through the user's configured estimator model waterfall. Unlike the web bulk route (which hydrates tasks from the DB by id), the mobile variant accepts inline task objects so unsaved/local tasks can be estimated. Per-task failures are returned inline; the call still succeeds.",
    request: {
      headers: [JSON_HEADER, AUTH_HEADER],
      query: [],
      body: [
        "tasks: array (required, max 25) of objects, each: { id?: string, name: string (required), description?: string, projectName?: string, context?: string, tags?: string[], priority?: number, dueInDays?: number, subtaskCount?: number }",
      ],
    },
    responses: {
      success:
        '200: {"data":{"results":[{"id":"local-1","minutes":45,"confidence":"high","rationale":"...","model":"claude-opus-4-8"},{"id":"local-2","error":"estimation_failed"}]},"meta":{},"error":null}',
      errors: [
        '{"data":null,"error":{"code":"validation_error","message":"tasks (non-empty array with name) is required"}}',
        '{"data":null,"error":{"code":"invalid_access_token","message":"Access token is invalid or expired"}}',
        '{"data":null,"error":{"code":"insufficient_scope","message":"PAT is missing required scope"}}',
        '{"data":null,"error":{"code":"internal_error","message":"Failed to estimate tasks"}}',
      ],
    },
    exampleCurl: [
      'curl -X POST "<base-url>/api/mobile/tasks/estimate/bulk" \\',
      `  -H "Authorization: Bearer ff_pat_..." \\`,
      `  -H "${JSON_HEADER}" \\`,
      "  -d '{\"tasks\":[{\"id\":\"local-1\",\"name\":\"Fix login crash\",\"priority\":1},{\"id\":\"local-2\",\"name\":\"Update docs\"}]}'",
    ].join("\n"),
  },
};

const toDocsPath = (routeFilePath: string) => {
  const relative = routeFilePath.replace(/^app\/api\//, "").replace(/\/route\.ts$/, "");
  const withParams = relative.replace(/\[([^\]]+)\]/g, "{$1}");
  return `/api/${withParams}`;
};

const readRouteFiles = async (dir: string): Promise<string[]> => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const routeFiles: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      routeFiles.push(...(await readRouteFiles(fullPath)));
    } else if (entry.isFile() && entry.name === "route.ts") {
      routeFiles.push(fullPath);
    }
  }

  return routeFiles;
};

const parseMethods = (fileContent: string): HttpMethod[] => {
  const found = new Set<HttpMethod>();
  const methodRegex = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g;

  for (const match of fileContent.matchAll(methodRegex)) {
    const method = match[1] as HttpMethod;
    if (HTTP_METHODS.includes(method)) {
      found.add(method);
    }
  }

  return [...found].sort((a, b) => HTTP_METHODS.indexOf(a) - HTTP_METHODS.indexOf(b));
};

const defaultAuthForPath = (pathValue: string): ApiAuthType => {
  if (
    pathValue === "/api/health" ||
    pathValue === "/api/accept-invite" ||
    pathValue === "/api/calendar/feed" ||
    pathValue === "/api/auth/login" ||
    pathValue === "/api/auth/register" ||
    pathValue === "/api/auth/forgot-password" ||
    pathValue === "/api/auth/logout" ||
    pathValue === "/api/mobile/auth/apple" ||
    pathValue === "/api/mobile/auth/refresh"
  ) {
    return "public";
  }

  if (pathValue.startsWith("/api/mobile/")) {
    return "bearer";
  }

  if (pathValue.startsWith("/api/sync/")) {
    return "bearer";
  }

  if (pathValue.startsWith("/api/debug") || pathValue === "/api/test-data") {
    return "internal";
  }

  return "cookie_session";
};

const defaultTagsForPath = (pathValue: string) => {
  const parts = pathValue.split("/").filter(Boolean);
  const primary = parts[1] || "api";
  if (primary === "mobile") {
    return ["mobile", parts[2] || "general"];
  }
  if (primary === "sync") {
    return ["sync", parts[2] || "general"];
  }
  return [primary];
};

const sentenceFromPath = (pathValue: string) =>
  `Handle ${pathValue.replace("/api/", "")} operations.`;

const methodRequestDefaults = (
  auth: ApiAuthType,
  method: HttpMethod,
): ApiRequestDoc => {
  const headers = [JSON_HEADER];
  if (auth === "bearer") headers.push(AUTH_HEADER);
  if (auth === "cookie_session") headers.push(COOKIE_HEADER);

  return {
    headers,
    query: method === "GET" ? ["Use endpoint-specific query params."] : [],
    body:
      method === "POST" || method === "PUT" || method === "PATCH"
        ? ["JSON body required. See endpoint implementation for full shape."]
        : [],
  };
};

const defaultSuccessEnvelope =
  '{"data": { ... }, "meta": { ... }, "error": null}';
const defaultErrorEnvelope =
  '{"data": null, "error": {"code": "error_code", "message": "description"}}';

const buildCurlExample = (method: HttpMethod, pathValue: string, auth: ApiAuthType) => {
  const lines = [`curl -X ${method} "<base-url>${pathValue}"`];
  if (auth === "bearer") lines.push(`  -H "${AUTH_HEADER}"`);
  if (auth === "cookie_session") lines.push(`  -H "${COOKIE_HEADER}"`);
  lines.push(`  -H "${JSON_HEADER}"`);
  if (method === "POST" || method === "PUT" || method === "PATCH") {
    lines.push(`  -d '{"example":"payload"}'`);
  }
  return lines.join(" \\\n");
};

export async function discoverApiRoutes(): Promise<DiscoveredRoute[]> {
  const apiRoot = path.join(process.cwd(), "app", "api");
  const routeFiles = await readRouteFiles(apiRoot);

  const discovered = await Promise.all(
    routeFiles.map(async (filePath) => {
      const content = await fs.readFile(filePath, "utf8");
      const normalized = filePath
        .replace(process.cwd(), "")
        .replace(/^\/+/, "")
        .replaceAll(path.sep, "/");

      return {
        path: toDocsPath(normalized),
        methods: parseMethods(content),
      };
    }),
  );

  return discovered
    .filter((route) => route.methods.length > 0)
    .sort((a, b) => a.path.localeCompare(b.path));
}

export async function buildApiDocsRegistry(): Promise<ApiDocsEntry[]> {
  const discovered = await discoverApiRoutes();

  return discovered.map((route) => {
    const override = endpointOverrides[route.path] ?? {};
    const auth = override.auth ?? defaultAuthForPath(route.path);
    const summary = override.summary ?? sentenceFromPath(route.path);
    const tags = override.tags ?? defaultTagsForPath(route.path);

    const methods: ApiMethodDoc[] = route.methods.map((method) => {
      const baseMethodDoc: ApiMethodDoc = {
        method,
        summary: `${method} ${route.path}`,
        request: methodRequestDefaults(auth, method),
        responses: {
          success: defaultSuccessEnvelope,
          errors: [defaultErrorEnvelope],
        },
        exampleCurl: buildCurlExample(method, route.path, auth),
      };
      const methodOverride = methodOverrides[`${route.path}#${method}`];

      if (!methodOverride) {
        return baseMethodDoc;
      }

      return {
        ...baseMethodDoc,
        ...methodOverride,
        request: methodOverride.request ?? baseMethodDoc.request,
        responses: methodOverride.responses ?? baseMethodDoc.responses,
      };
    });

    return {
      path: route.path,
      auth,
      summary,
      tags,
      methods,
    };
  });
}
