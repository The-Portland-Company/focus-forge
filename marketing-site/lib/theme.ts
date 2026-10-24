export type ThemePreference = "light" | "dark" | "system";

/** Current storage/cookie key. */
export const THEME_STORAGE_KEY = "tpc_theme";
export const THEME_COOKIE = "tpc_theme";
export const THEME_PENDING_COOKIE = "tpc_theme_pending";

/** Legacy keys kept for backward-compatible reads (migrated to THEME_* on write). */
export const LEGACY_THEME_STORAGE_KEY = "politogy_theme";
export const LEGACY_THEME_COOKIE = "politogy_theme";

/**
 * Cookie-domain allowlist: a site on one of these parent domains (or the
 * domain itself) gets the shared, domain-scoped theme cookie so the
 * preference follows the visitor across subdomains of that brand. Anything
 * else (e.g. a bare localhost, or a domain not in this list) gets a
 * host-only cookie instead.
 */
export const THEME_COOKIE_DOMAIN_ALLOWLIST = [
  ".theportlandcompany.com",
  ".politogyvrm.com",
  ".agentswarmapp.com",
] as const;

/** Returns the shared cookie `Domain` (with leading dot) for `hostname`, or null for a host-only cookie. */
export function resolveCookieDomain(hostname: string): string | null {
  const host = hostname.toLowerCase();
  for (const domain of THEME_COOKIE_DOMAIN_ALLOWLIST) {
    const bare = domain.slice(1); // strip leading "."
    if (host === bare || host.endsWith(`.${bare}`)) return domain;
  }
  return null;
}

const VALID: ThemePreference[] = ["light", "dark", "system"];

export function isThemePreference(v: unknown): v is ThemePreference {
  return typeof v === "string" && (VALID as string[]).includes(v);
}

function readCookieValue(name: string): string | null {
  if (typeof document === "undefined") return null;
  try {
    const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

/** Reads `tpc_theme`, falling back to the legacy `politogy_theme` cookie. */
export function readThemeCookie(): ThemePreference | null {
  const v = readCookieValue(THEME_COOKIE);
  if (isThemePreference(v)) return v;
  const legacy = readCookieValue(LEGACY_THEME_COOKIE);
  return isThemePreference(legacy) ? legacy : null;
}

function writeSharedCookie(name: string, value: string, maxAgeSeconds: number): void {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const domain = resolveCookieDomain(window.location.hostname);
  const domainAttr = domain ? `; Domain=${domain}` : "";
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${domainAttr}${secure}`;
}

export function writeThemeCookie(pref: ThemePreference): void {
  writeSharedCookie(THEME_COOKIE, pref, 31536000);
}

export function markThemeChoicePending(pref: ThemePreference): void {
  writeSharedCookie(THEME_PENDING_COOKIE, pref, 31536000);
}

export function readPendingThemeChoice(): ThemePreference | null {
  if (typeof document === "undefined") return null;
  try {
    const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${THEME_PENDING_COOKIE}=([^;]+)`));
    const v = m ? decodeURIComponent(m[1]) : null;
    return isThemePreference(v) ? v : null;
  } catch {
    return null;
  }
}

export function clearPendingThemeChoice(): void {
  writeSharedCookie(THEME_PENDING_COOKIE, "", 0);
}

export function resolveTheme(pref: ThemePreference): "light" | "dark" {
  if (pref === "system") {
    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {
      return "light";
    }
  }
  return pref;
}

export function readStoredThemePreference(): ThemePreference {
  const cookie = readThemeCookie();
  if (cookie) return cookie;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemePreference(stored)) return stored;
    const legacyStored = window.localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
    if (isThemePreference(legacyStored)) return legacyStored;
  } catch {
    /* storage unavailable */
  }
  return "system";
}

export function readResolvedTheme(): "light" | "dark" {
  return resolveTheme(readStoredThemePreference());
}

export function applyThemePreference(pref: ThemePreference): void {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(pref);
  const d = document.documentElement;
  d.classList.toggle("dark", resolved === "dark");
  try {
    d.style.colorScheme = resolved;
  } catch {
    /* ignore */
  }
}

/** Apply a chosen preference now and mark it pending for the next app to persist. */
export function applyThemeChoice(pref: ThemePreference): void {
  if (typeof document === "undefined") return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    /* storage unavailable */
  }
  writeThemeCookie(pref);
  markThemeChoicePending(pref);
  applyThemePreference(pref);
}

/** Pre-paint script: set `.dark` before first paint, from cookie/localStorage. Inline this in <head>. */
export const THEME_PREPAINT_SCRIPT = `(function(){try{
var KEY=${JSON.stringify(THEME_STORAGE_KEY)};
var LEGACY_KEY=${JSON.stringify(LEGACY_THEME_STORAGE_KEY)};
var VALID=["light","dark","system"];
function fromCookie(){try{
  var m=document.cookie.match(/(?:^|;\\s*)${THEME_COOKIE}=([^;]+)/);
  if(m)return decodeURIComponent(m[1]);
  var lm=document.cookie.match(/(?:^|;\\s*)${LEGACY_THEME_COOKIE}=([^;]+)/);
  return lm?decodeURIComponent(lm[1]):null;
}catch(e){return null;}}
var cookie=fromCookie();
var ls=null;try{ls=localStorage.getItem(KEY)||localStorage.getItem(LEGACY_KEY);}catch(e){}
var pref=cookie||ls||"system";
if(VALID.indexOf(pref)===-1)pref="system";
if(cookie&&cookie!==ls){try{localStorage.setItem(KEY,cookie);}catch(e){}}
var resolved=pref;
if(pref==="system"){try{resolved=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}catch(e){resolved="light";}}
var d=document.documentElement;
if(resolved==="dark"){d.classList.add("dark");}else{d.classList.remove("dark");}
try{d.style.colorScheme=resolved;}catch(e){}
}catch(e){}})();`;

/**
 * Live update script: keeps `.dark` correct across OS scheme changes (while
 * preference is "system") AND across React root re-renders that rewrite
 * `<html className>` and drop the pre-paint class (tpc-auth commit cb73bcf).
 * Inline this once, after THEME_PREPAINT_SCRIPT, anywhere in <body> or <head>.
 */
export const THEME_LIVE_UPDATE_SCRIPT = `(function(){try{
var KEY=${JSON.stringify(THEME_STORAGE_KEY)};
function fromCookie(){try{
  var m=document.cookie.match(/(?:^|;\\s*)${THEME_COOKIE}=([^;]+)/);
  if(m)return decodeURIComponent(m[1]);
  var lm=document.cookie.match(/(?:^|;\\s*)${LEGACY_THEME_COOKIE}=([^;]+)/);
  return lm?decodeURIComponent(lm[1]):null;
}catch(e){return null;}}
var mql=window.matchMedia("(prefers-color-scheme: dark)");
function onChange(e){
  var cookie=fromCookie();
  var ls=null;try{ls=localStorage.getItem(KEY);}catch(err){}
  var pref=cookie||ls||"system";
  if(pref!=="system")return;
  var d=document.documentElement;
  if(e.matches){d.classList.add("dark");}else{d.classList.remove("dark");}
  try{d.style.colorScheme=e.matches?"dark":"light";}catch(err){}
}
if(mql.addEventListener){mql.addEventListener("change",onChange);}else if(mql.addListener){mql.addListener(onChange);}
function want(){var cookie=fromCookie();var ls=null;try{ls=localStorage.getItem(KEY);}catch(err){}var pref=cookie||ls||"system";return pref==="dark"||(pref!=="light"&&mql.matches);}
var d=document.documentElement;
new MutationObserver(function(){var w=want();if(w!==d.classList.contains("dark")){if(w){d.classList.add("dark");}else{d.classList.remove("dark");}try{d.style.colorScheme=w?"dark":"light";}catch(err){}}}).observe(d,{attributes:true,attributeFilter:["class"]});
}catch(e){}})();`;

/** Combined script for a single inline <script> tag in <head>. */
export const themeScript = `${THEME_PREPAINT_SCRIPT}\n${THEME_LIVE_UPDATE_SCRIPT}`;
