import { buildApiDocsRegistry, discoverApiRoutes } from "../lib/api/docs/registry";

async function main() {
  const discovered = await discoverApiRoutes();
  const docs = await buildApiDocsRegistry();

  const docsByPath = new Map(docs.map((entry) => [entry.path, entry]));
  const missing: Array<{ path: string; methods: string[] }> = [];

  for (const route of discovered) {
    const docEntry = docsByPath.get(route.path);
    if (!docEntry) {
      missing.push({ path: route.path, methods: route.methods });
      continue;
    }

    const documentedMethods = new Set(docEntry.methods.map((m) => m.method));
    const missingMethods = route.methods.filter((m) => !documentedMethods.has(m));
    if (missingMethods.length > 0) {
      missing.push({ path: route.path, methods: missingMethods });
    }
  }

  if (missing.length > 0) {
    console.error("API docs coverage failed. Missing entries/methods:");
    for (const item of missing) {
      console.error(`- ${item.path}: ${item.methods.join(", ")}`);
    }
    process.exit(1);
  }

  console.log(`API docs coverage OK. ${discovered.length} routes documented.`);
}

main().catch((error) => {
  console.error("API docs coverage check crashed:", error);
  process.exit(1);
});
