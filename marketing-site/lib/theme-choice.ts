import {
  LEGACY_THEME_COOKIE,
  applyThemeChoice,
  resolveCookieDomain,
  type ThemePreference,
} from "@/lib/theme"

/** Same attributes TPC UI uses for `tpc_theme` (Path, Max-Age, SameSite, Domain, Secure). */
function writeCookie(name: string, value: string) {
  const domain = resolveCookieDomain(window.location.hostname)
  const domainAttr = domain ? `; Domain=${domain}` : ""
  const secure = window.location.protocol === "https:" ? "; Secure" : ""
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax${domainAttr}${secure}`
}

/**
 * Applies a theme choice and writes BOTH cookies: `tpc_theme` (TPC UI, via
 * applyThemeChoice) and the legacy `politogy_theme` read by apps still on
 * @the-portland-company/shell, each with its pending marker.
 */
export function chooseTheme(pref: ThemePreference) {
  applyThemeChoice(pref)
  writeCookie(LEGACY_THEME_COOKIE, pref)
  writeCookie(`${LEGACY_THEME_COOKIE}_pending`, pref)
}
