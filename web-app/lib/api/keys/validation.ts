import type { ApiKeyCreateRequest } from "./types";
import { ALLOWED_API_SCOPES, normalizeScopes } from "./utils";

export function normalizeApiKeyCreateRequest(body: unknown): {
  error: string | null;
  payload?: Omit<ApiKeyCreateRequest, "organizationId"> & { organizationId?: string };
} {
  if (typeof body !== "object" || body === null) {
    return { error: "Invalid JSON payload." };
  }

  const typedBody = body as Record<string, any>;

  const name = String(typedBody.name || "").trim();
  if (!name) {
    return { error: "Name is required." };
  }

  const scopes = normalizeScopes(
    Array.isArray(typedBody.scopes) ? typedBody.scopes.map(String) : [],
  );

  const expiresAt = String(typedBody.expiresAt || "").trim();
  if (!expiresAt) {
    return { error: "Expiration date is required." };
  }

  const expiresMs = Date.parse(expiresAt);
  if (Number.isNaN(expiresMs)) {
    return { error: "Expiration date must be a valid ISO date string." };
  }
  if (expiresMs <= Date.now()) {
    return { error: "Expiration date must be in the future." };
  }

  const invalidScopes = Array.isArray(typedBody.scopes)
    ? typedBody.scopes.some((scope) => !ALLOWED_API_SCOPES.includes(String(scope) as any))
    : false;
  if (invalidScopes) {
    return { error: "Invalid scope value provided." };
  }

  return {
    error: null,
    payload: {
      name,
      scopes,
      expiresAt: new Date(expiresMs).toISOString(),
      organizationId: typeof typedBody.organizationId === "string" ? typedBody.organizationId.trim() : undefined,
    },
  };
}
