/**
 * Prime Agent is the default AI agent user. Tasks created programmatically (via the
 * mobile/PAT API or the in-app AI agent) are assigned to Prime Agent by default so
 * agent-generated work has a clear, consistent owner — unless the caller
 * explicitly assigns the task to someone else.
 *
 * Overridable via env for non-prod environments; falls back to the production
 * Prime Agent user id.
 */
export const PRIME_AGENT_USER_ID =
  process.env.PRIME_AGENT_USER_ID || "ef411928-38bb-47a7-8ee1-44d4be5d3a5a";
