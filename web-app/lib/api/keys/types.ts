export const ALLOWED_API_SCOPES = ["read", "write", "admin"] as const;

export type ApiKeyScope = (typeof ALLOWED_API_SCOPES)[number];

export interface ApiKeyBase {
  id: string;
  name: string;
  prefix: string;
  scopes: ApiKeyScope[];
  expiresAt: string;
  lastUsedAt: string | null;
  createdAt: string;
  createdBy: string;
  isActive: boolean;
}

export interface ApiKeyMeta extends ApiKeyBase {
  maskedKey?: string;
  organizationId?: string | null;
}

export interface ApiKeyListItem extends ApiKeyBase {
  organizationId?: string | null;
}

export interface ApiKeyCreateRequest {
  name: string;
  scopes: ApiKeyScope[];
  expiresAt: string;
  organizationId?: string;
}

export interface ApiKeyWithSecret extends ApiKeyBase {
  secret: string;
  organizationId?: string | null;
}

export interface ApiKeyCreateResponse {
  key: ApiKeyWithSecret;
}

