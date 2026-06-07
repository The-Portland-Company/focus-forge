/**
 * Redacts sensitive strings from memory text before storing or logging.
 * Pure function — no side effects, fully unit-testable.
 */
export function redactSensitiveMemoryText(input: string): string {
  let out = input

  // OpenAI secret keys
  out = out.replace(/sk-[A-Za-z0-9_-]{20,}/g, "[REDACTED]")

  // Supabase PATs
  out = out.replace(/sbp_[a-f0-9]{40,}/g, "[REDACTED]")

  // GitHub tokens (ghs_ = server, ghp_ = personal)
  out = out.replace(/gh[ps]_[A-Za-z0-9]{30,}/g, "[REDACTED]")

  // Bearer tokens in headers / inline
  out = out.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, "Bearer [REDACTED]")

  // password: value  or  password=value
  out = out.replace(/(password\s*[:=]\s*)\S+/gi, "$1[REDACTED]")

  // PEM private keys (single-line or multi-line)
  out = out.replace(
    /-----BEGIN [A-Z ]* PRIVATE KEY-----[\s\S]*?-----END [A-Z ]* PRIVATE KEY-----/g,
    "[REDACTED]",
  )

  // Credit-card-like 13–16 digit runs (with optional spaces/dashes between groups)
  out = out.replace(
    /\b(?:\d[ -]?){12,15}\d\b/g,
    "[REDACTED]",
  )

  // SSN  ddd-dd-dddd
  out = out.replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[REDACTED]")

  // Session cookie patterns: session=..., _session=..., connect.sid=...
  out = out.replace(
    /((?:session|_session|connect\.sid)\s*=\s*)[A-Za-z0-9%+/=._-]{16,}/gi,
    "$1[REDACTED]",
  )

  return out
}
