/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { applyEmailRules, ruleMatches } from "../email-inbox/rules";

test("ruleMatches checks sender domain and subject conditions", () => {
  const matched = ruleMatches(
    {
      id: "rule-1",
      name: "Client routing",
      source: "user",
      isActive: true,
      priority: 10,
      matchMode: "all",
      conditions: [
        { field: "sender_domain", operator: "contains", value: "acme.com" },
        { field: "subject", operator: "contains", value: "proposal" },
      ],
      actions: [{ type: "require_project" }],
      stopProcessing: false,
      createdAt: "",
      updatedAt: "",
    },
    {
      senderEmail: "ceo@acme.com",
      senderDomain: "acme.com",
      subject: "Proposal follow-up",
      body: "Please review this.",
      mailbox: "team@example.com",
      participants: [],
    },
  );

  assert.equal(matched, true);
});

test("applyEmailRules respects priority and stopProcessing", () => {
  const result = applyEmailRules(
    [
      {
        id: "rule-1",
        name: "Quarantine suspicious",
        source: "user",
        isActive: true,
        priority: 5,
        matchMode: "all",
        conditions: [
          { field: "subject", operator: "contains", value: "winner" },
        ],
        actions: [{ type: "quarantine" }],
        stopProcessing: true,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "rule-2",
        name: "Always delete marketing",
        source: "user",
        isActive: true,
        priority: 20,
        matchMode: "all",
        conditions: [
          { field: "sender_domain", operator: "contains", value: "promo.com" },
        ],
        actions: [{ type: "always_delete" }],
        stopProcessing: false,
        createdAt: "",
        updatedAt: "",
      },
    ],
    {
      senderEmail: "alerts@promo.com",
      senderDomain: "promo.com",
      subject: "Winner announcement",
      body: "Claim your prize",
      mailbox: "owner@example.com",
      participants: [],
    },
  );

  assert.deepEqual(
    result.matchedRules.map((rule) => rule.id),
    ["rule-1"],
  );
  assert.deepEqual(result.actions, ["quarantine"]);
  assert.equal(result.stopProcessing, true);
});
