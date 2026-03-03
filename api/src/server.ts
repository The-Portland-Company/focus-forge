import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { registerHealthRoute } from "./routes/health.js";
import { registerProxyRoutes } from "./routes/proxy.js";
import { fail } from "./lib/envelope.js";

const app = Fastify({ logger: true });

const origins = (process.env.CORS_ALLOWED_ORIGINS || "http://localhost:3244")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

await app.register(cors, {
  origin: origins,
  credentials: true,
});

app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);
  reply.code(500).send(fail("internal_error", "Unexpected server error"));
});

await registerHealthRoute(app);
await registerProxyRoutes(app);

const port = Number(process.env.PORT || 8081);
await app.listen({ port, host: "0.0.0.0" });

