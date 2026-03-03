import { randomBytes, createHash } from "crypto";

import type { ApiKeyScope } from "./types";

export const ALLOWED_API_SCOPES = ["read", "write", "admin"] as const;

export function normalizeScopes(scopes: string[] | undefined): ApiKeyScope[] {
  const selected = new Set<ApiKeyScope>();
  const values = Array.isArray(scopes) ? scopes : [];

  for (const scope of values) {
    if (ALLOWED_API_SCOPES.includes(scope as ApiKeyScope)) {
      selected.add(scope as ApiKeyScope);
    }
  }

  return selected.size > 0 ? Array.from(selected) : ["read"];
}

export function generateApiKeySecret(prefix = "ffk_live_"): string {
  const entropy = randomBytes(24).toString("base64url");
  return `${prefix}${entropy}`;
}

export function extractPrefixFromSecret(secret: string): string {
  const normalized = secret.trim();
  return normalized.slice(0, 10);
}

export function hashApiKeySecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function maskApiKey(prefix: string): string {
  return `${prefix}••••••••`;
}

export function isExpired(expiresAt: string): boolean {
  const parsed = Date.parse(expiresAt);
  if (Number.isNaN(parsed)) {
    return true;
  }
  return parsed <= Date.now();
}

export function mapScopeString(value: unknown): ApiKeyScope {
  if (typeof value === "string" && (ALLOWED_API_SCOPES as readonly string[]).includes(value)) {
    return value as ApiKeyScope;
  }
  return "read";
}
