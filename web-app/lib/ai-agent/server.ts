import { type AgentToolContext } from "@/lib/ai-agent/tools";
import { runAgentWithFallback, type ProviderPreference } from "@/lib/ai-agent/providers";

export type AgentChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AgentPageContext = {
  view?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  visibleTaskCount?: number | null;
};

export type AgentRunResult = {
  assistantMessage: string;
  /** Names of tools that ran, for the UI to know when to refresh. */
  toolsUsed: string[];
  mutated: boolean;
  /** Which provider answered (openai | anthropic | xai). */
  provider: string;
};

function buildSystemPrompt(page: AgentPageContext): string {
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const pageLines: string[] = [];
  if (page.view) pageLines.push(`- Current view: ${page.view}`);
  if (page.projectName) pageLines.push(`- Project on screen: "${page.projectName}" (projectId: ${page.projectId})`);
  if (typeof page.visibleTaskCount === "number") {
    pageLines.push(`- Approx. tasks visible on screen: ${page.visibleTaskCount}`);
  }

  return `You are the Focus Forge assistant — an AI agent embedded in a task-management app. You help the user manage their work the way a capable human assistant would.

Today's date is ${dateStr}.

You have tools to read and modify the user's tasks and email inbox. Use them rather than guessing.

Tasks:
- Questions about what exists ("what tasks do you see on this page", "what's due today") → list_tasks. For page-specific questions, pass the projectId from the page context below.
- Create / change / complete / delete tasks → the matching tool. Tools enforce permissions; you cannot touch data the user can't access.
- Picking a project for new tasks: if the page context has a project, default to it. If there's NO project on the page (the assistant is open globally) and the user doesn't name one, call list_projects, then match the project the user names — if it's ambiguous or unnamed, ask which project before creating. Never invent a projectId.

Daily priorities ("what are my priorities today?"):
- Call get_daily_capacity (capacity in minutes + today's date) and list_today_candidates (overdue + due-soon tasks with estimates).
- Reason about what realistically fits in the available capacity, factoring priority, overdue status, and deadlines. Prefer higher-priority and overdue work.
- Surface the chosen set into the Today view with add_task_to_today (sets due date = today). If a candidate has no estimate and you need one, propose one and use set_task_estimate.
- Then summarize the plan: what to do today, in order, and what you deferred and why.

Inbox ("cleanup my inbox", "any new tasks from my inbox?"):
- list_inbox to see threads (with classification: actionable/newsletter/spam/etc.).
- For cleanup: identify likely spam/newsletters. Before deleting, ask the user to confirm the borderline ones, then inbox_action (spam/delete/archive). Convert actionable emails into tasks with inbox_action action=to_task.
- When the user confirms a recurring preference ("always delete emails from X", "newsletters from Y are spam"), persist it with create_inbox_rule so future emails are auto-handled. List existing rules with list_inbox_rules.

Page context:
${pageLines.length ? pageLines.join("\n") : "- (no specific page context provided)"}

Rules:
- For destructive actions (delete_task, inbox_action delete/spam), only proceed after the user has clearly confirmed. If ambiguous, ask first.
- When creating a task and no project is specified, use the projectId from the page context.
- Be concise and concrete. After taking an action, briefly confirm what you did (include names).
- Dates are YYYY-MM-DD. Resolve relative dates ("tomorrow", "Friday") against today's date above.
- If a tool returns an error, explain it plainly and suggest a fix rather than retrying blindly.`;
}

export async function runAgent(input: {
  conversation: AgentChatMessage[];
  page: AgentPageContext;
  toolContext: AgentToolContext;
  preferredProvider?: ProviderPreference;
}): Promise<AgentRunResult> {
  const result = await runAgentWithFallback(
    {
      systemPrompt: buildSystemPrompt(input.page),
      conversation: input.conversation,
      toolContext: input.toolContext,
    },
    input.preferredProvider,
  );
  return {
    assistantMessage: result.assistantMessage,
    toolsUsed: result.toolsUsed,
    mutated: result.mutated,
    provider: result.provider,
  };
}
