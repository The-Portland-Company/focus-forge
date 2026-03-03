export const ok = (data, meta) => ({
    data,
    ...(meta ? { meta } : {}),
    error: null,
});
export const fail = (code, message, details) => ({
    data: null,
    error: {
        code,
        message,
        ...(details === undefined ? {} : { details }),
    },
});
