import { fail } from "../lib/envelope.js";
const publicPaths = new Set([
    "/v1/health",
    "/v1/auth/login",
    "/v1/auth/register",
    "/v1/auth/forgot-password",
    "/v1/auth/logout",
    "/v1/accept-invite",
    "/v1/calendar/feed",
    "/v1/mobile/auth/apple",
    "/v1/mobile/auth/refresh",
]);
const getBody = async (request) => {
    if (request.method === "GET" || request.method === "HEAD")
        return undefined;
    const contentType = request.headers["content-type"] || "";
    if (contentType.includes("application/json")) {
        return JSON.stringify(request.body ?? {});
    }
    return undefined;
};
export async function registerProxyRoutes(app) {
    app.all("/v1/*", async (request, reply) => {
        const webBase = process.env.WEB_APP_INTERNAL_URL || "http://localhost:3244";
        const requestPath = request.url.split("?")[0] || request.url;
        const routePath = request.url.replace(/^\/v1/, "/api");
        const targetUrl = new URL(routePath, webBase);
        if (!publicPaths.has(requestPath) &&
            !request.headers.authorization &&
            !request.headers.cookie) {
            reply.code(401);
            return fail("missing_auth", "Protected API route requires bearer token or web session cookie");
        }
        const body = await getBody(request);
        const upstream = await fetch(targetUrl, {
            method: request.method,
            headers: {
                "content-type": request.headers["content-type"] || "application/json",
                ...(request.headers.authorization
                    ? { authorization: request.headers.authorization }
                    : {}),
                ...(request.headers.cookie ? { cookie: request.headers.cookie } : {}),
            },
            body,
        });
        const text = await upstream.text();
        reply.code(upstream.status);
        upstream.headers.forEach((value, key) => {
            if (key.toLowerCase() === "content-encoding")
                return;
            if (key.toLowerCase() === "content-length")
                return;
            reply.header(key, value);
        });
        return reply.send(text);
    });
}
