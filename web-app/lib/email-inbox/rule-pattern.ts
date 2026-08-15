/**
 * Pattern templates for rule values.
 *
 * A rule value like "You've hit 80% of your quota" only ever matches that one
 * number. Users want one rule for the whole family of those emails, so a rule
 * value may carry placeholders:
 *
 *   {number} / {#}  any non-negative whole number
 *   {0-100}         a whole number whose VALUE falls in that range, inclusive
 *   *               any run of characters, including none
 *
 * Everything else in the template is literal text. Matching is
 * case-insensitive and, by default, substring — the template has to occur
 * somewhere in the field, not be the whole field.
 *
 * This is deliberately NOT raw regex: rule values are user input, and handing
 * an untrusted string to `new RegExp` invites both syntax errors and
 * catastrophic backtracking. The template compiles to a regex we build
 * ourselves, so every quantifier in it is one we emitted.
 */

/** Longest template we will compile. Real rule values are short. */
const MAX_TEMPLATE_LENGTH = 200;
/** Caps on the quantifiers we emit, so compiled patterns stay cheap. */
const MAX_WILDCARDS = 10;
const MAX_NUMBER_PLACEHOLDERS = 10;
/** A digit run longer than this is not a number anyone is range-checking. */
const MAX_NUMBER_DIGITS = 15;
/** Bound on re-scanning a field after an out-of-range number (see below). */
const MAX_RANGE_RESTARTS = 200;

const PLACEHOLDER_AT_START = /^\{([^{}]*)\}/;
const ANY_PLACEHOLDER = /\{[^{}]*\}/;

export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * True when a rule value is written as a pattern rather than plain text. Used
 * to route `contains`/`equals` values through the matcher without making the
 * user also switch the operator — `{...}` and `*` are unambiguous.
 */
export function templateHasPattern(value: string | null | undefined): boolean {
  if (!value) return false;
  return value.includes("*") || ANY_PLACEHOLDER.test(value);
}

type Segment =
  | { kind: "literal"; text: string }
  | { kind: "wildcard" }
  /** `min`/`max` null means "any number", no range check. */
  | { kind: "number"; min: number | null; max: number | null };

function parsePlaceholder(inner: string): Segment | null {
  const token = inner.trim().toLowerCase();
  if (token === "number" || token === "#") {
    return { kind: "number", min: null, max: null };
  }

  const range = /^(\d{1,15})\s*-\s*(\d{1,15})$/.exec(token);
  if (!range) return null;

  const min = Number.parseInt(range[1], 10);
  const max = Number.parseInt(range[2], 10);
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) return null;
  if (min > max) return null;

  return { kind: "number", min, max };
}

/**
 * Split a template into literal / wildcard / number segments. Braces that
 * aren't a placeholder we recognize (`{urgent}`) stay literal, so a value that
 * happens to contain braces keeps matching the way plain text did.
 */
function parseTemplate(template: string): Segment[] | null {
  if (!template || template.length > MAX_TEMPLATE_LENGTH) return null;

  const segments: Segment[] = [];
  let literal = "";

  const flushLiteral = () => {
    if (literal) {
      segments.push({ kind: "literal", text: literal });
      literal = "";
    }
  };

  let index = 0;
  while (index < template.length) {
    const char = template[index];

    if (char === "*") {
      flushLiteral();
      // Collapse runs of wildcards: `**` is one `.*`, not a nested quantifier.
      if (segments[segments.length - 1]?.kind !== "wildcard") {
        segments.push({ kind: "wildcard" });
      }
      index += 1;
      continue;
    }

    if (char === "{") {
      const match = PLACEHOLDER_AT_START.exec(template.slice(index));
      const placeholder = match ? parsePlaceholder(match[1]) : null;
      if (match && placeholder) {
        flushLiteral();
        segments.push(placeholder);
        index += match[0].length;
        continue;
      }
    }

    literal += char;
    index += 1;
  }

  flushLiteral();
  return segments.length > 0 ? segments : null;
}

type CompiledTemplate = {
  regex: RegExp;
  /** Number segments in capture-group order, for the post-match range check. */
  numbers: Array<{ min: number | null; max: number | null }>;
};

function compileTemplate(
  template: string,
  anchored: boolean,
): CompiledTemplate | null {
  const segments = parseTemplate(template);
  if (!segments) return null;

  const wildcards = segments.filter((s) => s.kind === "wildcard").length;
  const numbers = segments.filter(
    (s): s is Extract<Segment, { kind: "number" }> => s.kind === "number",
  );
  if (wildcards > MAX_WILDCARDS) return null;
  if (numbers.length > MAX_NUMBER_PLACEHOLDERS) return null;

  // A template of nothing but wildcards would match every email ever received.
  // That is never what someone meant to save, so it matches nothing instead.
  const hasLiteral = segments.some((s) => s.kind === "literal");
  if (!hasLiteral && numbers.length === 0) return null;

  const source = segments
    .map((segment) => {
      switch (segment.kind) {
        case "literal":
          return escapeRegExp(segment.text);
        case "wildcard":
          return ".*";
        case "number":
          return `(\\d{1,${MAX_NUMBER_DIGITS}})`;
      }
    })
    .join("");

  // `s` so `*` spans newlines in message bodies; `i` for case-insensitivity.
  const flags = anchored ? "is" : "gis";

  try {
    return {
      regex: new RegExp(anchored ? `^${source}$` : source, flags),
      numbers: numbers.map(({ min, max }) => ({ min, max })),
    };
  } catch {
    return null;
  }
}

/**
 * Ranges can't be expressed in the regex itself without absurd alternations,
 * so `{0-100}` captures the digits and the value is checked here.
 */
function rangesSatisfied(
  match: RegExpMatchArray,
  numbers: CompiledTemplate["numbers"],
): boolean {
  for (let i = 0; i < numbers.length; i += 1) {
    const { min, max } = numbers[i];
    if (min === null || max === null) continue;

    const raw = match[i + 1];
    if (raw === undefined) return false;

    const value = Number.parseInt(raw, 10);
    if (!Number.isFinite(value)) return false;
    if (value < min || value > max) return false;
  }

  return true;
}

export type MatchesPatternOptions = {
  /** Require the whole field to match, not just a substring. */
  anchored?: boolean;
};

/**
 * Does `haystack` contain (or, anchored, equal) the pattern `template`?
 *
 * An empty or uncompilable template matches nothing — a rule that silently
 * matched everything would be far worse than one that matches nothing.
 */
export function matchesPattern(
  haystack: string,
  template: string,
  options: MatchesPatternOptions = {},
): boolean {
  const compiled = compileTemplate(template ?? "", options.anchored === true);
  if (!compiled) return false;

  const target = haystack ?? "";

  if (options.anchored === true) {
    const match = compiled.regex.exec(target);
    return match ? rangesSatisfied(match, compiled.numbers) : false;
  }

  // Ranges are checked after the match, so a match whose number is out of
  // range is not the final answer — a later occurrence may still be in range.
  // Restarting one character on (rather than past the whole match) is what
  // finds it: a trailing `*` is greedy and would otherwise swallow the rest of
  // the field, hiding every later occurrence.
  compiled.regex.lastIndex = 0;
  let match = compiled.regex.exec(target);
  let restarts = 0;
  while (match) {
    if (rangesSatisfied(match, compiled.numbers)) return true;
    restarts += 1;
    if (restarts > MAX_RANGE_RESTARTS) return false;
    compiled.regex.lastIndex = match.index + 1;
    match = compiled.regex.exec(target);
  }

  return false;
}

/** One-line syntax reminder, shown next to rule value inputs. */
export const RULE_PATTERN_HELP =
  "Use {0-100} for a number in range, {number} for any number, and * for anything. Ex. You've hit {0-100}% of your *";
