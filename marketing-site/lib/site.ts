// Central site config. Update SITE_URL once the final subdomain is wired.
export const SITE_URL = "https://getfocusforge.theportlandcompany.com"
export const APP_URL = "https://focusforge.theportlandcompany.com"

export const SITE = {
  name: "Focus Forge",
  tagline: "The task manager your AI agents can actually run.",
  description:
    "Focus Forge is a fast, dark-first task and project manager with a built-in AI agent. Plan your day, run autonomous Claude Code loops against your tasks, and ship — on web, iOS, and macOS.",
  company: "The Portland Company",
  email: "hello@theportlandcompany.com",
  url: SITE_URL,
  appUrl: APP_URL,
} as const

// The headline autonomous-loop command, click-to-copy on the site.
export const LOOP_COMMAND =
  "/loop 1m Watch /focus-forge for existing or new Tasks. Spawn a Team of Subagents to complete all of them through PRs, and verify deployment to staging and production."
