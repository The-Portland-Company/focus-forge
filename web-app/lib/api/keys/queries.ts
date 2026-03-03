import type { ApiKeyMeta } from "./types";
import { mapScopeString } from "./utils";

export type ApiKeyDbRow = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[] | null;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string | null;
  created_by: string | null;
  is_active: boolean | null;
  organization_id?: string | null;
};

export const toApiKeyMeta = (row: ApiKeyDbRow): ApiKeyMeta => ({
  id: row.id,
  name: row.name,
  prefix: row.prefix,
  scopes: (row.scopes || []).map(mapScopeString),
  expiresAt: row.expires_at || "",
  lastUsedAt: row.last_used_at,
  createdAt: row.created_at || new Date().toISOString(),
  createdBy: row.created_by || "",
  isActive: Boolean(row.is_active),
  organizationId: row.organization_id ?? null,
  maskedKey: `${row.prefix}••••••••`,
});
