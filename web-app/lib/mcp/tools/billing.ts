// MCP billing tools for Focus Forge — always FREE / available to any verified
// identity (requiredScopes: ["read"]). They proxy to TPC Auth, the single
// source of entitlements, forwarding the caller's own access token.
//
//  - get_subscription_status : plan/status/trial_end + AI credit balance
//  - start_checkout          : Stripe Checkout URL for Forge Pro (first month free)
//  - buy_ai_credits          : Stripe Checkout URL for a prepaid credit top-up (min $5)
//  - manage_billing          : Stripe billing-portal URL
//
// The user taps the returned URL in chat; no card details ever touch this server.
import type { McpTool, McpToolResult } from "@/lib/mcp/server/types";
import { getEntitlement, startCheckout, buyCredits, managePortal } from "@/lib/mcp/server/tpc-billing";

const toResult = (value: unknown): McpToolResult => ({
  content: [{ type: "text", text: JSON.stringify(value ?? null) }],
  structuredContent: Array.isArray(value) ? { items: value } : value,
});

const errorResult = (message: string): McpToolResult => ({
  content: [{ type: "text", text: message }],
  isError: true,
});

const needToken = (token?: string) => (token ? null : errorResult("Not authenticated."));

export const BILLING_MCP_TOOLS: McpTool[] = [
  {
    name: "get_subscription_status",
    title: "Subscription status",
    description:
      "Show the current Focus Forge plan, subscription status (trialing / active / past_due / canceled), trial end date, and prepaid AI credit balance in cents. Always available.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    requiredScopes: ["read"],
    handler: async (_args, ctx) => {
      const miss = needToken(ctx.tpcToken);
      if (miss) return miss;
      const { status, data } = await getEntitlement(ctx.tpcToken!);
      if (status !== 200) return errorResult(`Could not read subscription status (${status}).`);
      return toResult(data);
    },
  },
  {
    name: "start_checkout",
    title: "Subscribe to Focus Forge Pro",
    description:
      "Start a Stripe Checkout for Focus Forge Pro. The first month is free (30-day trial). Returns a checkout URL for the user to open and complete in their browser. Optional: plan_key (defaults to 'pro').",
    inputSchema: {
      type: "object",
      properties: { plan_key: { type: "string", description: "Plan key to subscribe to. Defaults to 'pro'." } },
      additionalProperties: false,
    },
    requiredScopes: ["read"],
    handler: async (args, ctx) => {
      const miss = needToken(ctx.tpcToken);
      if (miss) return miss;
      const planKey = typeof args.plan_key === "string" ? args.plan_key : undefined;
      const { status, data } = await startCheckout(ctx.tpcToken!, planKey);
      if (status !== 200 || !data.url) return errorResult(`Could not start checkout (${status}: ${data.error ?? "unknown"}).`);
      return toResult({ checkout_url: data.url, note: "Open this URL to subscribe. First month is free." });
    },
  },
  {
    name: "buy_ai_credits",
    title: "Buy AI credits",
    description:
      "Start a Stripe Checkout to prepay AI credits used by AI-powered features. Amount is in US dollars; minimum $5. Returns a checkout URL. Optional: amount_usd (defaults to 5).",
    inputSchema: {
      type: "object",
      properties: { amount_usd: { type: "number", description: "Dollars to prepay. Minimum 5." } },
      additionalProperties: false,
    },
    requiredScopes: ["read"],
    handler: async (args, ctx) => {
      const miss = needToken(ctx.tpcToken);
      if (miss) return miss;
      const usd = typeof args.amount_usd === "number" && Number.isFinite(args.amount_usd) ? args.amount_usd : 5;
      const cents = Math.round(usd * 100);
      const { status, data } = await buyCredits(ctx.tpcToken!, cents);
      if (status !== 200 || !data.url) return errorResult(`Could not start credit purchase (${status}: ${data.error ?? "unknown"}).`);
      return toResult({ checkout_url: data.url, amount_cents: data.amount_cents, note: "Open this URL to add AI credits." });
    },
  },
  {
    name: "manage_billing",
    title: "Manage billing",
    description:
      "Open the Stripe billing portal to update payment methods, view invoices, or cancel the Focus Forge Pro subscription. Returns a portal URL. Always available.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    requiredScopes: ["read"],
    handler: async (_args, ctx) => {
      const miss = needToken(ctx.tpcToken);
      if (miss) return miss;
      const { status, data } = await managePortal(ctx.tpcToken!);
      if (status !== 200 || !data.url) return errorResult(`Could not open billing portal (${status}: ${data.error ?? "unknown"}).`);
      return toResult({ portal_url: data.url });
    },
  },
];
