import { ok } from "../lib/envelope.js";
export async function registerHealthRoute(app) {
    app.get("/v1/health", async () => ok({ status: "ok" }));
}
