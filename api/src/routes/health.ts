import type { FastifyInstance } from "fastify";
import { ok } from "../lib/envelope.js";

export async function registerHealthRoute(app: FastifyInstance) {
  app.get("/v1/health", async () => ok({ status: "ok" }));
}

