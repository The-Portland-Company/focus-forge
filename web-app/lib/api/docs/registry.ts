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
