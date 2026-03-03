export type ApiError = {
  code: string;
  message: string;
  details?: unknown;
};

export type ApiEnvelope<T> = {
  data: T | null;
  meta?: Record<string, unknown>;
  error: ApiError | null;
};

export const ok = <T>(data: T, meta?: Record<string, unknown>): ApiEnvelope<T> => ({
  data,
  ...(meta ? { meta } : {}),
  error: null,
});

export const fail = (
  code: string,
  message: string,
  details?: unknown,
): ApiEnvelope<null> => ({
  data: null,
  error: {
    code,
    message,
    ...(details === undefined ? {} : { details }),
  },
});

