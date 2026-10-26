// Focus: Forge — Local AI bridge (desktop shell).
//
// The web app's assistant normally calls remote provider APIs server-side
// (OpenAI → Anthropic → xAI). When every remote provider is out of credit or
// unreachable, the chat dead-ends with "All AI providers failed" — which is
// exactly the failure the user hit. A deployed server can never reach a CLI
// running on the user's own Mac, so "Local AI" has to live here, in the
// desktop shell, where we can actually spawn the local agent CLIs.
//
// This module runs the user's LOCAL agent sessions as providers:
//   local-claude → the Claude Code CLI (`claude`)   [primary]
//   local-codex  → the Codex CLI      (`codex exec`) [fallback 1]
//   local-grok   → the Grok CLI       (`grok`)       [fallback 2]
//
// Each local session already carries the user's MCP servers (incl. the
// focus-forge MCP), skills, and plugins from its own config (~/.claude.json,
// ~/.codex/config.toml, ~/.grok/config.toml), so a local session can actually
// EXECUTE Focus Forge commands — not just chat about them. We pass an extra
// system instruction that (a) tells it to use the Focus Forge MCP tools to do
// the work and (b) REQUIRES it to report, in its final message, every action
// it took, so the chatbot UI stays the single source of truth even when the
// work is done by an out-of-band local agent.

const { spawn } = require("child_process");
const os = require("os");
const path = require("path");
const fs = require("fs");

// Per-call wall-clock ceiling. Local agents with tool loops are slower than a
// single remote completion, so this is generous — but still bounded so a hung
// session can't wedge the chat forever.
const PER_CALL_TIMEOUT_MS = 240_000;

// Resolve a CLI binary: prefer the login-shell PATH, fall back to the known
// install locations so we work even if Electron launched with a thin PATH.
function resolveBin(name, fallbacks) {
  for (const p of fallbacks) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return name; // last resort: rely on PATH
}

const HOME = os.homedir();
const BINS = {
  claude: resolveBin("claude", [
    path.join(HOME, ".local/bin/claude"),
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
  ]),
  codex: resolveBin("codex", [
    path.join(HOME, ".local/bin/codex"),
    "/opt/homebrew/bin/codex",
  ]),
  grok: resolveBin("grok", [path.join(HOME, ".grok/bin/grok"), "/opt/homebrew/bin/grok"]),
};

// A PATH that includes the usual CLI install dirs, so a spawned agent can find
// node, npx (for stdio MCP servers), and friends regardless of Electron's env.
function enrichedPath() {
  const extra = [
    path.join(HOME, ".local/bin"),
    path.join(HOME, ".grok/bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ];
  const current = (process.env.PATH || "").split(":").filter(Boolean);
  return Array.from(new Set([...extra, ...current])).join(":");
}

// The shared instruction that makes a local session act as the Focus Forge
// assistant AND report back, so nothing it does is invisible to the UI.
function buildSystemInstruction(context) {
  const lines = [
    "You are the Focus Forge Assistant, running as a LOCAL agent session on the user's Mac.",
    "You have the Focus Forge MCP server and the focus-forge skill available. Use the Focus",
    "Forge MCP tools to actually perform what the user asks (read/create/update/complete tasks,",
    "projects, goals, inbox actions) — do not just describe what could be done.",
    "",
    "CRITICAL — the chat UI is the single source of truth: whatever you do, your FINAL message",
    "must plainly report every concrete action you took (tool/MCP calls, what changed, and the",
    "result), so the on-screen chat reflects reality even though you ran outside it. If you",
    "delegate to sub-agents, summarize what they did too. If you could not do something, say so",
    "and why. Keep the final message concise and user-facing.",
  ];
  if (context && context.view) lines.push("", `Current view: ${context.view}`);
  if (context && context.projectName) lines.push(`Current project: ${context.projectName}`);
  if (context && context.timezone) lines.push(`User timezone: ${context.timezone}`);
  return lines.join("\n");
}

// Flatten the conversation into a single prompt. The local CLIs' headless
// "single prompt" mode takes one string; we label roles so the model keeps the
// thread straight. Only the trailing turns matter most, but we include the
// recent transcript for continuity.
function buildPrompt(messages) {
  const recent = messages.slice(-20);
  const body = recent
    .map((m) => {
      const who = m.role === "assistant" ? "Assistant" : "User";
      return `${who}: ${m.content}`;
    })
    .join("\n\n");
  return `${body}\n\nAssistant:`;
}

function runProcess(bin, args, { input, onEvent } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(bin, args, {
        env: { ...process.env, PATH: enrichedPath() },
        cwd: HOME,
      });
    } catch (err) {
      resolve({ ok: false, error: `spawn failed: ${err.message}`, stdout: "", stderr: "" });
      return;
    }
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      resolve({ ok: false, error: "timed out", stdout, stderr });
    }, PER_CALL_TIMEOUT_MS);

    if (input != null) {
      child.stdin.write(input);
      child.stdin.end();
    }
    child.stdout.on("data", (d) => {
      stdout += d.toString();
      if (onEvent) onEvent({ type: "stdout", chunk: d.toString() });
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, error: err.message, stdout, stderr });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: code === 0, code, stdout, stderr });
    });
  });
}

// Pull the user-facing text out of a CLI's JSON (or JSONL) output, tolerating
// the small shape differences between the three CLIs.
function extractText(raw) {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "";
  // Try a single JSON object first.
  try {
    const obj = JSON.parse(trimmed);
    const t = obj.result ?? obj.text ?? obj.content ?? obj.message;
    if (typeof t === "string" && t.trim()) return t.trim();
  } catch {
    /* not a single JSON object; fall through */
  }
  // Try JSONL — scan from the end for the last result-bearing line.
  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const obj = JSON.parse(lines[i]);
      if (obj && (obj.type === "result" || obj.result)) {
        const t = obj.result ?? obj.text ?? obj.content;
        if (typeof t === "string" && t.trim()) return t.trim();
      }
    } catch {
      /* not JSON; keep scanning */
    }
  }
  // Fall back to the raw text (e.g. codex plain output).
  return trimmed;
}

// ---- Individual provider runners ----

// Durable FF MCP OAuth credential (refresh token), written once by the
// one-time authorization. The bridge refreshes a short-lived access token from
// it per turn so headless local sessions always have forge:read/write.
const FF_OAUTH_FILE = path.join(HOME, ".focusforge", "mcp-oauth.json");
let cachedAccess = null; // { token, exp } — in-memory, refreshed on demand.

async function mintFfAccessToken() {
  // Still valid for >30s? reuse it.
  if (cachedAccess && cachedAccess.exp - Date.now() > 30_000) return cachedAccess.token;
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(FF_OAUTH_FILE, "utf8"));
  } catch {
    return null; // not authorized on this machine
  }
  if (!cfg.refresh_token || !cfg.client_id) return null;
  try {
    const form = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: cfg.refresh_token,
      client_id: cfg.client_id,
      resource: cfg.resource || "https://app.focusforge.dev",
    });
    const resp = await fetch(`${cfg.issuer}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    if (!resp.ok) return null;
    const body = await resp.json();
    if (!body.access_token) return null;
    // Rotate the refresh token if the server issued a new one.
    if (body.refresh_token && body.refresh_token !== cfg.refresh_token) {
      try {
        fs.writeFileSync(
          FF_OAUTH_FILE,
          JSON.stringify({ ...cfg, refresh_token: body.refresh_token, saved_at: Date.now() }, null, 2),
          { mode: 0o600 },
        );
      } catch {
        /* non-fatal */
      }
    }
    const ttl = (Number(body.expires_in) || 300) * 1000;
    cachedAccess = { token: body.access_token, exp: Date.now() + ttl };
    return body.access_token;
  } catch {
    return null;
  }
}

// The Focus Forge MCP endpoint. It is a TPC-Auth-protected resource that
// accepts the user's `ff_at` access-token (or a tpc_pat_… PAT) as a bearer
// token — so injecting that token as an Authorization header gives a HEADLESS
// local session an authenticated FF MCP without the interactive OAuth dance.
const FF_MCP_URL = "https://app.focusforge.dev/api/mcp";

// Build a --mcp-config that overrides the user's unauthenticated focus-forge
// entry with a token-authenticated one, while still MERGING the rest of the
// user's ~/.claude.json (skills, plugins, other MCP servers stay available).
// Use a DISTINCT name ("focus-forge-local") rather than "focus-forge": a
// same-named entry in the user's ~/.claude.json (unauthenticated, OAuth-gated)
// otherwise shadows this one and the token header is ignored, leaving the tools
// unauthorized. A separate name registers an independent, header-authenticated
// server so the headless session actually gets the FF tools.
const FF_MCP_SERVER_NAME = "focus-forge-local";
function ffMcpConfig(token) {
  return JSON.stringify({
    mcpServers: {
      [FF_MCP_SERVER_NAME]: {
        type: "http",
        url: FF_MCP_URL,
        headers: { Authorization: `Bearer ${token}` },
      },
    },
  });
}

async function runClaude({ prompt, system, onEvent, ffToken }) {
  const args = [
    "-p",
    prompt,
    "--output-format",
    "json",
    "--permission-mode",
    "bypassPermissions",
    "--append-system-prompt",
    system,
  ];
  // Give the headless session an authenticated Focus Forge MCP so it can
  // actually execute FF commands, not just chat about them.
  if (ffToken) {
    args.push("--mcp-config", ffMcpConfig(ffToken));
  }
  const r = await runProcess(BINS.claude, args, { onEvent });
  if (!r.ok && !r.stdout) throw new Error(r.error || `claude exited ${r.code}`);
  const text = extractText(r.stdout);
  if (!text) throw new Error(r.stderr?.slice(0, 300) || "claude produced no output");
  return text;
}

async function runGrok({ prompt, system, onEvent }) {
  const args = [
    "-p",
    prompt,
    "--output-format",
    "json",
    "--always-approve",
    "--rules",
    system,
  ];
  const r = await runProcess(BINS.grok, args, { onEvent });
  if (!r.ok && !r.stdout) throw new Error(r.error || `grok exited ${r.code}`);
  const text = extractText(r.stdout);
  if (!text) throw new Error(r.stderr?.slice(0, 300) || "grok produced no output");
  return text;
}

async function runCodex({ prompt, system, onEvent }) {
  // codex exec is noisy on stderr but prints the final agent message to stdout.
  // We prepend the system instruction into the prompt since exec has no
  // dedicated append-system flag.
  const full = `${system}\n\n---\n\n${prompt}`;
  const args = ["exec", "--skip-git-repo-check", full];
  const r = await runProcess(BINS.codex, args, { onEvent });
  if (!r.ok && !r.stdout) throw new Error(r.error || `codex exited ${r.code}`);
  const text = extractText(r.stdout);
  if (!text) throw new Error(r.stderr?.slice(0, 300) || "codex produced no output");
  return text;
}

const RUNNERS = {
  "local-claude": { label: "Claude (local)", run: runClaude, bin: () => BINS.claude },
  "local-codex": { label: "Codex (local)", run: runCodex, bin: () => BINS.codex },
  "local-grok": { label: "Grok (local)", run: runGrok, bin: () => BINS.grok },
};

// Default fallback order for local sessions.
const DEFAULT_LOCAL_CHAIN = ["local-claude", "local-codex", "local-grok"];

function binExists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

// Which local providers are actually installed on this machine.
function listLocalProviders() {
  return Object.entries(RUNNERS).map(([id, r]) => ({
    id,
    label: r.label,
    available: binExists(r.bin()) || !r.bin().includes("/"),
  }));
}

// Run the local provider chain: try each configured provider in order, falling
// through on failure, exactly like the server's remote waterfall.
async function runLocalAgent({ messages, chain, context, onEvent, ffToken }) {
  const order = Array.isArray(chain) && chain.length ? chain : DEFAULT_LOCAL_CHAIN;
  // Token precedence for the FF MCP:
  //  1. FF_MCP_TOKEN env — explicit override (a forge-scoped token/PAT).
  //  2. A fresh access token refreshed from the stored OAuth credential
  //     (~/.focusforge/mcp-oauth.json) — this is the durable, forge-scoped
  //     path that actually grants FF tool execution headlessly.
  //  3. the signed-in session's ff_at — identity only (no forge scopes), a
  //     last-ditch fallback that lets FF read-less chat still work.
  const mcpToken = process.env.FF_MCP_TOKEN || (await mintFfAccessToken()) || ffToken || null;
  const system = buildSystemInstruction(context || {});
  const prompt = buildPrompt(Array.isArray(messages) ? messages : []);
  const errors = [];
  for (const id of order) {
    const runner = RUNNERS[id];
    if (!runner) continue;
    if (onEvent) onEvent({ type: "provider-start", provider: id, label: runner.label });
    try {
      const text = await runner.run({ prompt, system, onEvent, ffToken: mcpToken });
      return { ok: true, assistantMessage: text, provider: id, providerLabel: runner.label };
    } catch (err) {
      errors.push(`${id}: ${err.message}`);
      if (onEvent) onEvent({ type: "provider-fail", provider: id, error: err.message });
    }
  }
  return {
    ok: false,
    error: `All local AI sessions failed. ${errors.join(" | ")}`,
    provider: null,
  };
}

module.exports = {
  runLocalAgent,
  listLocalProviders,
  DEFAULT_LOCAL_CHAIN,
  // exported for tests
  extractText,
  buildPrompt,
  buildSystemInstruction,
};
