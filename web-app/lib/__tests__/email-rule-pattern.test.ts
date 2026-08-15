/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  escapeRegExp,
  matchesPattern,
  templateHasPattern,
} from "../email-inbox/rule-pattern";
import { compareValue } from "../email-inbox/rules";

const QUOTA = "You've hit {0-100}% of your *";

test("range placeholder matches the family of quota subjects", () => {
  assert.equal(matchesPattern("you've hit 80% of your quota", QUOTA), true);
  assert.equal(
    matchesPattern("Re: You've hit 100% of your limit", QUOTA),
    true,
    "substring semantics: a Re: prefix must not break the match",
  );
  assert.equal(matchesPattern("You've hit 0% of your quota", QUOTA), true);
});

test("range placeholder rejects out-of-range numbers", () => {
  assert.equal(matchesPattern("You've hit 120% of your quota", QUOTA), false);
  assert.equal(matchesPattern("You've hit 101% of your quota", QUOTA), false);
});

test("range boundaries are inclusive", () => {
  assert.equal(matchesPattern("hit 0 units", "hit {0-100} units"), true);
  assert.equal(matchesPattern("hit 100 units", "hit {0-100} units"), true);
  assert.equal(matchesPattern("hit 101 units", "hit {0-100} units"), false);
});

test("a later in-range occurrence still matches", () => {
  // The trailing `*` is greedy, so the first (out-of-range) occurrence would
  // otherwise swallow the rest of the field and hide the valid one.
  assert.equal(
    matchesPattern(
      "You've hit 120% of your trial. You've hit 50% of your quota.",
      QUOTA,
    ),
    true,
  );
});

test("non-matching text does not match", () => {
  assert.equal(matchesPattern("You've won a prize", QUOTA), false);
  assert.equal(matchesPattern("You've hit the wall of your quota", QUOTA), false);
});

test("{number} and {#} match any whole number", () => {
  assert.equal(matchesPattern("Order 1 shipped", "Order {number} shipped"), true);
  assert.equal(
    matchesPattern("Order 99381 shipped", "Order {number} shipped"),
    true,
  );
  assert.equal(matchesPattern("Order 7 shipped", "Order {#} shipped"), true);
  assert.equal(
    matchesPattern("Order seven shipped", "Order {number} shipped"),
    false,
  );
});

test("* matches any run of characters, including none", () => {
  assert.equal(matchesPattern("invoice for march", "invoice*march"), true);
  assert.equal(matchesPattern("invoicemarch", "invoice*march"), true);
  assert.equal(matchesPattern("invoice for april", "invoice*march"), false);
  assert.equal(
    matchesPattern("subject line\nsecond line", "subject*second"),
    true,
    "* should span newlines so body matching works",
  );
});

test("literal-only templates behave like contains", () => {
  assert.equal(matchesPattern("Quarterly proposal draft", "proposal"), true);
  assert.equal(matchesPattern("Quarterly report draft", "proposal"), false);
});

test("matching is case-insensitive", () => {
  assert.equal(matchesPattern("YOU'VE HIT 42% OF YOUR QUOTA", QUOTA), true);
  assert.equal(matchesPattern("PROPOSAL", "proposal"), true);
});

test("empty and wildcard-only templates match nothing", () => {
  assert.equal(matchesPattern("anything at all", ""), false);
  assert.equal(matchesPattern("anything at all", "*"), false);
  assert.equal(matchesPattern("anything at all", "***"), false);
});

test("over-long templates are refused", () => {
  assert.equal(matchesPattern("a".repeat(400), "a".repeat(201)), false);
});

test("unrecognized braces stay literal", () => {
  assert.equal(matchesPattern("re: {urgent} ticket", "{urgent}"), true);
  assert.equal(matchesPattern("re: urgent ticket", "{urgent}"), false);
  assert.equal(matchesPattern("cost {1-} today", "{1-}"), true);
});

test("regex metacharacters in a template are literal", () => {
  assert.equal(matchesPattern("save 50% now (limited)", "(limited)"), true);
  assert.equal(matchesPattern("save 50 now limited", "(limited)"), false);
  assert.equal(matchesPattern("a.b", "a.b"), true);
  assert.equal(matchesPattern("axb", "a.b"), false);
});

test("anchored matching requires the whole field", () => {
  assert.equal(matchesPattern("hit 80% today", "hit {0-100}% today", { anchored: true }), true);
  assert.equal(
    matchesPattern("Re: hit 80% today", "hit {0-100}% today", { anchored: true }),
    false,
  );
});

test("templateHasPattern detects placeholders and wildcards", () => {
  assert.equal(templateHasPattern("hit {0-100}%"), true);
  assert.equal(templateHasPattern("hit {number}%"), true);
  assert.equal(templateHasPattern("invoice*"), true);
  assert.equal(templateHasPattern("plain text"), false);
  assert.equal(templateHasPattern(""), false);
  assert.equal(templateHasPattern(null), false);
});

test("escapeRegExp neutralizes metacharacters", () => {
  assert.equal(escapeRegExp("a.b*c"), "a\\.b\\*c");
  assert.equal(new RegExp(escapeRegExp("a+b")).test("a+b"), true);
  assert.equal(new RegExp(escapeRegExp("a+b")).test("aab"), false);
});

test("compareValue supports the matches operator", () => {
  assert.equal(
    compareValue("You've hit 80% of your quota", "matches", QUOTA),
    true,
  );
  assert.equal(
    compareValue("You've hit 120% of your quota", "matches", QUOTA),
    false,
  );
});

test("compareValue auto-routes contains/equals when the value is a pattern", () => {
  assert.equal(
    compareValue("Re: You've hit 95% of your storage", "contains", QUOTA),
    true,
  );
  assert.equal(
    compareValue("Re: You've hit 95% of your storage", "equals", QUOTA),
    false,
    "equals stays anchored even with placeholders",
  );
  assert.equal(
    compareValue("You've hit 95% of your storage", "equals", QUOTA),
    true,
  );
});

test("compareValue keeps plain values on the original operators", () => {
  assert.equal(compareValue("Proposal follow-up", "contains", "proposal"), true);
  assert.equal(compareValue("Proposal", "equals", "proposal"), true);
  assert.equal(compareValue("Proposal follow-up", "equals", "proposal"), false);
  assert.equal(
    compareValue("Proposal follow-up", "starts_with", "proposal"),
    true,
  );
  assert.equal(compareValue("Proposal follow-up", "ends_with", "up"), true);
});
