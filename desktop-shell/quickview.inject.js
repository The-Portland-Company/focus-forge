/* Focus: Forge — Quick View overlay.
 *
 * Injected (via webContents.executeJavaScript) into a window already loaded on
 * the deployed app origin, so it runs same-origin: it can read the Supabase
 * session cookie and call /api/mobile/* with the user's access token.
 *
 * A simplified, Apple-Notes-style brain-dump pad: type one task per line, then
 * assign each to a project / due date / priority and push them all into Forge.
 * Inline shorthand on a line is parsed automatically:
 *     Buy stamps #errands @tomorrow !2
 *   #project   -> matches a project by name (case-insensitive substring)
 *   @date      -> today | tomorrow | mon..sun | YYYY-MM-DD | +3 (days)
 *   !priority  -> !1 (highest) .. !4 (lowest, default)
 */
(() => {
  if (window.__ffQuickView) {
    window.__ffQuickView.focus();
    return;
  }

  // ---------- auth: pull the Supabase access token from the session cookie ----
  function readAccessToken() {
    const jar = document.cookie ? document.cookie.split("; ") : [];
    const parts = {};
    let base = null;
    for (const entry of jar) {
      const eq = entry.indexOf("=");
      if (eq < 0) continue;
      const name = entry.slice(0, eq);
      const value = entry.slice(eq + 1);
      const m = name.match(/^(sb-.*-auth-token)(?:\.(\d+))?$/);
      if (!m) continue;
      base = m[1];
      const idx = m[2] === undefined ? 0 : Number(m[2]);
      parts[idx] = value;
    }
    if (base === null) return null;
    let raw = Object.keys(parts)
      .map(Number)
      .sort((a, b) => a - b)
      .map((i) => parts[i])
      .join("");
    try {
      raw = decodeURIComponent(raw);
    } catch (_) {
      /* value was not percent-encoded */
    }
    if (raw.startsWith("base64-")) raw = raw.slice("base64-".length);
    let json;
    try {
      let b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4) b64 += "=";
      const bin = atob(b64);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      json = new TextDecoder().decode(bytes);
    } catch (_) {
      try {
        json = decodeURIComponent(escape(atob(raw)));
      } catch (e) {
        return null;
      }
    }
    try {
      const session = JSON.parse(json);
      return session.access_token || (session.currentSession && session.currentSession.access_token) || null;
    } catch (_) {
      return null;
    }
  }

  // The session cookies (ff_at / ff_rt, and Supabase variants) are httpOnly in
  // production, so page JS cannot read them. The Electron main process can, and
  // hands the bearer token over via window.ffqvGetToken (see quickview-preload).
  // readAccessToken() remains a fallback for deployments with a JS-readable cookie.
  let TOKEN = null;
  async function resolveToken() {
    try {
      if (window.ffqvGetToken) {
        const t = await window.ffqvGetToken();
        if (t) return t;
      }
    } catch (_) {
      /* bridge unavailable */
    }
    return readAccessToken();
  }

  // These are the app's own cookie-authenticated web routes (same ones the
  // Today UI uses). The window is same-origin with the httpOnly session cookie,
  // so credentials:"include" authenticates us — no bearer token needed.
  async function api(path, options = {}) {
    const headers = Object.assign(
      { "Content-Type": "application/json" },
      options.headers || {},
    );
    const res = await fetch(path, {
      ...options,
      headers,
      credentials: "include",
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error("not signed in");
    }
    let body = null;
    try {
      body = await res.json();
    } catch (_) {
      /* non-JSON */
    }
    if (!res.ok) {
      const msg =
        (body && (body.error && (body.error.message || body.error))) ||
        "HTTP " + res.status;
      throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
    return body;
  }

  // ---------- shorthand parsing ------------------------------------------------
  const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  function isoDate(d) {
    const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return z.toISOString().slice(0, 10);
  }
  function resolveDate(word) {
    const w = word.toLowerCase();
    const now = new Date();
    if (w === "today") return isoDate(now);
    if (w === "tomorrow" || w === "tmr") {
      now.setDate(now.getDate() + 1);
      return isoDate(now);
    }
    if (/^\+\d+$/.test(w)) {
      now.setDate(now.getDate() + Number(w.slice(1)));
      return isoDate(now);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(w)) return w;
    const dow = DOW.indexOf(w.slice(0, 3));
    if (dow >= 0) {
      const delta = (dow - now.getDay() + 7) % 7 || 7;
      now.setDate(now.getDate() + delta);
      return isoDate(now);
    }
    return null;
  }

  function parseLine(line) {
    const task = { name: line.trim(), project: null, due: null, priority: 4 };
    task.name = task.name
      .replace(/(^|\s)#([^\s#@!]+)/g, (_, s, v) => {
        task.project = v.replace(/_/g, " ");
        return s;
      })
      .replace(/(^|\s)@(\S+)/g, (full, s, v) => {
        const d = resolveDate(v);
        if (d) {
          task.due = d;
          return s;
        }
        return full;
      })
      .replace(/(^|\s)!([1-4])/g, (_, s, v) => {
        task.priority = Number(v);
        return s;
      })
      .replace(/\s+/g, " ")
      .trim();
    return task;
  }

  // ---------- styling ----------------------------------------------------------
  const C = {
    bg: "#09090b", // zinc-950, matches the app shell
    panel: "#18181b", // zinc-900
    row: "#1c1c1f",
    text: "#fafafa",
    muted: "#a1a1aa", // zinc-400
    border: "#27272a", // zinc-800
    accent: "#e4e4e7", // neutral primary (matches app buttons)
    accentText: "#09090b",
    good: "#34d399",
  };
  const font =
    'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';

  const style = document.createElement("style");
  style.textContent = `
    #ffqv, #ffqv * { box-sizing: border-box; }
    #ffqv {
      position: fixed; inset: 0; z-index: 2147483647;
      background: ${C.bg}; color: ${C.text}; font-family: ${font};
      display: flex; flex-direction: column; overflow: hidden;
      font-size: 14px; line-height: 1.4;
    }
    #ffqv .ffqv-head {
      -webkit-app-region: drag; user-select: none;
      display: flex; align-items: center; gap: 8px;
      padding: 12px 14px 10px; border-bottom: 1px solid ${C.border};
    }
    #ffqv .ffqv-title { font-weight: 600; font-size: 13px; letter-spacing: .02em; }
    #ffqv .ffqv-dot { width: 9px; height: 9px; border-radius: 50%; background: ${C.accent}; }
    #ffqv .ffqv-spacer { flex: 1; }
    #ffqv .ffqv-x {
      -webkit-app-region: no-drag; cursor: pointer; color: ${C.muted};
      border: none; background: transparent; font-size: 18px; line-height: 1;
      padding: 2px 6px; border-radius: 6px;
    }
    #ffqv .ffqv-x:hover { background: ${C.row}; color: ${C.text}; }
    #ffqv .ffqv-pad {
      flex: 0 0 auto; padding: 10px 14px;
    }
    #ffqv textarea {
      width: 100%; min-height: 96px; resize: vertical;
      background: ${C.panel}; color: ${C.text};
      border: 1px solid ${C.border}; border-radius: 10px;
      padding: 10px 12px; font: inherit; outline: none;
    }
    #ffqv textarea::placeholder { color: ${C.muted}; }
    #ffqv .ffqv-hint { color: ${C.muted}; font-size: 11px; margin-top: 6px; }
    #ffqv .ffqv-list { flex: 1; overflow-y: auto; padding: 0 14px 8px; }
    #ffqv .ffqv-task {
      background: ${C.row}; border: 1px solid ${C.border}; border-radius: 10px;
      padding: 8px 10px; margin-bottom: 8px; display: flex; flex-direction: column; gap: 6px;
    }
    #ffqv .ffqv-task.done { opacity: .5; }
    #ffqv .ffqv-task input.ffqv-name {
      background: transparent; border: none; color: ${C.text}; font: inherit;
      font-weight: 500; outline: none; width: 100%;
    }
    #ffqv .ffqv-meta { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
    #ffqv .ffqv-meta select, #ffqv .ffqv-meta input {
      background: ${C.panel}; color: ${C.text}; border: 1px solid ${C.border};
      border-radius: 7px; padding: 4px 7px; font: inherit; font-size: 12px; outline: none;
    }
    #ffqv .ffqv-del {
      margin-left: auto; cursor: pointer; background: transparent; border: none;
      color: ${C.muted}; font-size: 14px; padding: 2px 6px; border-radius: 6px;
    }
    #ffqv .ffqv-del:hover { color: #f87171; background: ${C.panel}; }
    #ffqv .ffqv-foot {
      flex: 0 0 auto; padding: 10px 14px 14px; border-top: 1px solid ${C.border};
      display: flex; align-items: center; gap: 10px;
    }
    #ffqv .ffqv-status { color: ${C.muted}; font-size: 12px; flex: 1; }
    #ffqv .ffqv-status.err { color: #f87171; }
    #ffqv .ffqv-status.ok { color: ${C.good}; }
    #ffqv button.ffqv-btn {
      -webkit-app-region: no-drag; cursor: pointer; font: inherit; font-weight: 600;
      border: none; border-radius: 9px; padding: 8px 14px;
      background: ${C.accent}; color: ${C.accentText};
    }
    #ffqv button.ffqv-btn:disabled { opacity: .5; cursor: default; }
    #ffqv button.ffqv-btn.ghost { background: ${C.panel}; color: ${C.text}; border: 1px solid ${C.border}; }
  `;
  document.head.appendChild(style);

  // ---------- DOM --------------------------------------------------------------
  const root = document.createElement("div");
  root.id = "ffqv";
  root.innerHTML = `
    <div class="ffqv-head">
      <span class="ffqv-dot"></span>
      <span class="ffqv-title">Quick View — brain dump</span>
      <span class="ffqv-spacer"></span>
      <button class="ffqv-x" title="Close (Esc)">&times;</button>
    </div>
    <div class="ffqv-pad">
      <textarea class="ffqv-input" placeholder="One task per line&#10;Ship invoice #clientx @tomorrow !2&#10;Call dentist @fri"></textarea>
      <div class="ffqv-hint">Enter = new line · <b>#project</b> <b>@today/tomorrow/fri/2026-05-01/+3</b> <b>!1–4</b> · ⌘↵ to capture</div>
    </div>
    <div class="ffqv-list"></div>
    <div class="ffqv-foot">
      <span class="ffqv-status"></span>
      <button class="ffqv-btn ghost ffqv-capture">Capture</button>
      <button class="ffqv-btn ffqv-add" disabled>Add to Forge</button>
    </div>
  `;
  document.body.appendChild(root);
  window.__ffQuickView = { focus: () => input.focus() };

  const input = root.querySelector(".ffqv-input");
  const list = root.querySelector(".ffqv-list");
  const statusEl = root.querySelector(".ffqv-status");
  const addBtn = root.querySelector(".ffqv-add");
  const captureBtn = root.querySelector(".ffqv-capture");

  let projects = [];
  const drafts = []; // { name, project_id, due, priority, el, done }

  function setStatus(msg, kind) {
    statusEl.textContent = msg || "";
    statusEl.className = "ffqv-status" + (kind ? " " + kind : "");
  }

  function findProject(nameFragment) {
    if (!nameFragment) return null;
    const q = nameFragment.toLowerCase();
    return (
      projects.find((p) => (p.name || "").toLowerCase() === q) ||
      projects.find((p) => (p.name || "").toLowerCase().includes(q)) ||
      null
    );
  }

  function projectOptions(selectedId) {
    const opts = ['<option value="">Inbox (no project)</option>'];
    for (const p of projects) {
      const sel = p.id === selectedId ? " selected" : "";
      opts.push(`<option value="${p.id}"${sel}>${(p.name || "Untitled").replace(/</g, "&lt;")}</option>`);
    }
    return opts.join("");
  }

  function renderDraft(d) {
    const el = document.createElement("div");
    el.className = "ffqv-task";
    el.innerHTML = `
      <input class="ffqv-name" value="${(d.name || "").replace(/"/g, "&quot;")}" />
      <div class="ffqv-meta">
        <select class="ffqv-proj">${projectOptions(d.project_id)}</select>
        <input class="ffqv-due" type="date" value="${d.due || ""}" />
        <select class="ffqv-prio">
          ${[1, 2, 3, 4]
            .map((n) => `<option value="${n}"${n === d.priority ? " selected" : ""}>P${n}</option>`)
            .join("")}
        </select>
        <button class="ffqv-del" title="Remove">&#10005;</button>
      </div>
    `;
    el.querySelector(".ffqv-name").addEventListener("input", (e) => (d.name = e.target.value));
    el.querySelector(".ffqv-proj").addEventListener("change", (e) => (d.project_id = e.target.value || null));
    el.querySelector(".ffqv-due").addEventListener("change", (e) => (d.due = e.target.value || null));
    el.querySelector(".ffqv-prio").addEventListener("change", (e) => (d.priority = Number(e.target.value)));
    el.querySelector(".ffqv-del").addEventListener("click", () => {
      const i = drafts.indexOf(d);
      if (i >= 0) drafts.splice(i, 1);
      el.remove();
      addBtn.disabled = drafts.length === 0;
    });
    d.el = el;
    list.appendChild(el);
  }

  function capture() {
    const lines = input.value.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    for (const line of lines) {
      const parsed = parseLine(line);
      const proj = findProject(parsed.project);
      const d = {
        name: parsed.name,
        project_id: proj ? proj.id : null,
        due: parsed.due,
        priority: parsed.priority,
        done: false,
      };
      drafts.push(d);
      renderDraft(d);
    }
    input.value = "";
    addBtn.disabled = drafts.length === 0;
    setStatus(drafts.length + " task" + (drafts.length === 1 ? "" : "s") + " ready");
    input.focus();
  }

  async function addAll() {
    const pending = drafts.filter((d) => !d.done && d.name.trim());
    if (!pending.length) return;
    addBtn.disabled = true;
    let ok = 0;
    for (const d of pending) {
      try {
        const payload = { name: d.name.trim(), priority: d.priority };
        if (d.project_id) payload.project_id = d.project_id;
        if (d.due) payload.due_date = d.due;
        await api("/api/tasks", { method: "POST", body: JSON.stringify(payload) });
        d.done = true;
        d.el.classList.add("done");
        d.el.querySelectorAll("input,select,button").forEach((n) => (n.disabled = true));
        ok++;
        setStatus("Added " + ok + "/" + pending.length + "…", "ok");
      } catch (e) {
        setStatus("Failed on “" + d.name + "”: " + e.message, "err");
        addBtn.disabled = false;
        return;
      }
    }
    setStatus("Added " + ok + " task" + (ok === 1 ? "" : "s") + " to Forge ✓", "ok");
    // Drop the completed drafts after a beat.
    setTimeout(() => {
      for (let i = drafts.length - 1; i >= 0; i--) {
        if (drafts[i].done) {
          drafts[i].el.remove();
          drafts.splice(i, 1);
        }
      }
      addBtn.disabled = drafts.length === 0;
    }, 900);
  }

  captureBtn.addEventListener("click", capture);
  addBtn.addEventListener("click", addAll);
  input.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      capture();
    }
  });
  root.querySelector(".ffqv-x").addEventListener("click", () => {
    if (window.ffqvClose) window.ffqvClose();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && window.ffqvClose) window.ffqvClose();
  });

  // ---------- boot -------------------------------------------------------------
  (async () => {
    try {
      setStatus("Loading projects…");
      const db = await api("/api/database");
      const list = (db && db.projects) || [];
      projects = list
        .filter((p) => p && p.id && !p.archived)
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setStatus(projects.length + " projects · ready");
    } catch (e) {
      if (e.message === "not signed in") {
        setStatus("Not signed in — open the main window and sign in first.", "err");
      } else {
        setStatus("Couldn’t load projects: " + e.message, "err");
      }
    }
    input.focus();
  })();
})();
