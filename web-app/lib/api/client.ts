export type ApiEnvelope<T> = {
  data: T | null;
  meta?: Record<string, unknown>;
  error: { code: string; message: string; details?: unknown } | null;
};

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

export const apiBaseUrl = () =>
  trimTrailingSlash(process.env.NEXT_PUBLIC_API_BASE_URL || "");

export const apiUrl = (path: string) => {
  const normalized = path.startsWith("/v1") ? path : `/v1${path.startsWith("/") ? path : `/${path}`}`;
  const base = apiBaseUrl();
  return base ? `${base}${normalized}` : normalized;
};

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<ApiEnvelope<T>> {
  const response = await fetch(apiUrl(path), init);
  const text = await response.text();
  const json = text ? (JSON.parse(text) as ApiEnvelope<T>) : null;

  if (!response.ok) {
    throw new Error(
      json?.error?.message || `API request failed (${response.status})`,
    );
  }

  if (!json) {
    throw new Error("API request returned empty response");
  }
  return json;
}

