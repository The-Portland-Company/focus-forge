// Competitor comparison data.
//
// Positioning is derived strictly from Focus Forge's own product. Competitor
// cells describe widely-known, publicly-observable product facts (platforms,
// whether an autonomous AI agent exists, etc.) and deliberately avoid pricing
// claims and quotes. Focus Forge is the reference column and is always "yes".

export type Cell = "yes" | "no" | "partial"

export interface FeatureRow {
  /** Short capability label. */
  label: string
  /** One-line explanation of why it matters (Focus Forge framing). */
  detail: string
  /** Focus Forge is always "yes" — this is the competitor's value. */
  values: Record<string, { cell: Cell; note?: string }>
}

export interface Competitor {
  slug: string
  name: string
  /** How the competitor positions itself, in neutral terms. */
  tagline: string
  /** What they genuinely do well — stated fairly. */
  goodAt: string
  /** The honest reason someone outgrows it and moves to Focus Forge. */
  gap: string
  /** 3 headline wins for Focus Forge vs this tool. */
  wins: { title: string; body: string }[]
}

export const COMPETITORS: Competitor[] = [
  {
    slug: "todoist",
    name: "Todoist",
    tagline:
      "A polished, cross-platform to-do list known for natural-language input and a huge integration catalog.",
    goodAt:
      "Fast task capture, clean design, and a mature ecosystem of plugins and integrations built up over years.",
    gap:
      "Its AI helps you write and suggest — it doesn't run your backlog. There's no autonomous agent that creates, edits, and completes tasks on your behalf.",
    wins: [
      {
        title: "An agent that does the work, not just suggests it",
        body: "Todoist's AI rephrases and proposes. Focus Forge ships a built-in agent that actually creates, edits, and completes tasks across a project when you ask.",
      },
      {
        title: "Autonomous loops against your real backlog",
        body: "Point Focus Forge's Claude Code loop at your tasks and let it work them through to done — a workflow Todoist has no equivalent for.",
      },
      {
        title: "Email and work live in one place",
        body: "A connected inbox turns messages into tasks natively, instead of relying on forwarding tricks or third-party plugins.",
      },
    ],
  },
  {
    slug: "ticktick",
    name: "TickTick",
    tagline:
      "A feature-packed task app blending to-dos, a calendar, habits, and a built-in Pomodoro timer.",
    goodAt:
      "Bundling planning, habit tracking, and focus timers into one tidy cross-platform app at a friendly price.",
    gap:
      "It's a manual planner. However many views it adds, you're still the one moving every task — there's no AI agent doing the execution.",
    wins: [
      {
        title: "Let an agent clear the backlog",
        body: "TickTick gives you more places to organize work by hand. Focus Forge gives you an agent that can complete it for you.",
      },
      {
        title: "Resilient AI that keeps working",
        body: "A 3-provider fallback keeps the assistant responsive when a single model provider is down — not a bolt-on suggestion feature.",
      },
      {
        title: "Built for teams and orgs",
        body: "Multiple organizations, projects, and role-based access scale past a personal task list without changing tools.",
      },
    ],
  },
  {
    slug: "things",
    name: "Things",
    tagline:
      "An award-winning, beautifully designed personal task manager for Apple devices.",
    goodAt:
      "Best-in-class native design and a calm, focused single-user planning experience on iPhone, iPad, and Mac.",
    gap:
      "It's Apple-only, single-player, and intentionally AI-free — no web app, no team access, and nothing that executes work for you.",
    wins: [
      {
        title: "Works everywhere, not just Apple",
        body: "Focus Forge runs on a fast web app alongside native iOS and macOS, so your plan isn't trapped on one platform.",
      },
      {
        title: "A built-in AI agent",
        body: "Things is deliberately manual. Focus Forge adds an agent that can create, edit, and complete tasks — and run autonomous loops.",
      },
      {
        title: "Teams, not just you",
        body: "Organizations, projects, and roles mean the same tool covers solo planning and team execution.",
      },
    ],
  },
  {
    slug: "motion",
    name: "Motion",
    tagline:
      "An AI calendar that auto-schedules your tasks and meetings into open time blocks.",
    goodAt:
      "Automatically arranging your day — fitting tasks around meetings and reshuffling when plans change.",
    gap:
      "Its AI schedules time; it doesn't do the work in the tasks. There's no conversational agent that executes your backlog or runs autonomous loops.",
    wins: [
      {
        title: "An agent that executes, not just schedules",
        body: "Motion decides when you'll do a task. Focus Forge's agent can actually create, edit, and complete the tasks themselves.",
      },
      {
        title: "Autonomous Claude Code loops",
        body: "Hand a running loop your backlog and let it drive tasks to done — beyond auto-scheduling a calendar.",
      },
      {
        title: "Calendar planning included",
        body: "You still get a calendar and time-blocking for your day — plus email-to-task and a real project manager underneath.",
      },
    ],
  },
]

export const FEATURE_ROWS: FeatureRow[] = [
  {
    label: "Built-in AI agent that executes tasks",
    detail: "Create, edit, and complete tasks by asking — not just suggestions.",
    values: {
      todoist: { cell: "partial", note: "AI suggests & rephrases" },
      ticktick: { cell: "no" },
      things: { cell: "no" },
      motion: { cell: "partial", note: "Schedules, doesn't execute" },
    },
  },
  {
    label: "Autonomous agent loops",
    detail: "Point a Claude Code loop at your backlog and let it work to done.",
    values: {
      todoist: { cell: "no" },
      ticktick: { cell: "no" },
      things: { cell: "no" },
      motion: { cell: "no" },
    },
  },
  {
    label: "Resilient 3-provider AI fallback",
    detail: "The assistant keeps working when one provider goes down.",
    values: {
      todoist: { cell: "no" },
      ticktick: { cell: "no" },
      things: { cell: "no" },
      motion: { cell: "no" },
    },
  },
  {
    label: "Fast, dark-first web app",
    detail: "A keyboard-friendly web client, not just mobile.",
    values: {
      todoist: { cell: "yes" },
      ticktick: { cell: "yes" },
      things: { cell: "no", note: "Apple only, no web" },
      motion: { cell: "yes" },
    },
  },
  {
    label: "Native iOS & macOS apps",
    detail: "Real native apps, not a wrapped web view.",
    values: {
      todoist: { cell: "yes" },
      ticktick: { cell: "yes" },
      things: { cell: "yes" },
      motion: { cell: "partial", note: "Web-first" },
    },
  },
  {
    label: "Calendar & time-blocking",
    detail: "See tasks on a calendar and block time for them.",
    values: {
      todoist: { cell: "partial", note: "Via integrations" },
      ticktick: { cell: "yes" },
      things: { cell: "no" },
      motion: { cell: "yes" },
    },
  },
  {
    label: "Email turned into tasks",
    detail: "A connected inbox so messages live next to the work.",
    values: {
      todoist: { cell: "partial", note: "Forwarding / plugins" },
      ticktick: { cell: "partial", note: "Forwarding" },
      things: { cell: "partial", note: "Mail-to-Things" },
      motion: { cell: "no" },
    },
  },
  {
    label: "Organizations, projects & roles",
    detail: "Team structure with role-based access, not just a personal list.",
    values: {
      todoist: { cell: "yes" },
      ticktick: { cell: "partial", note: "Basic sharing" },
      things: { cell: "no", note: "Single-user" },
      motion: { cell: "yes" },
    },
  },
  {
    label: "Interactive in-app tutorial",
    detail: "Resumable chapters and contextual tips built into the product.",
    values: {
      todoist: { cell: "partial" },
      ticktick: { cell: "partial" },
      things: { cell: "partial" },
      motion: { cell: "partial" },
    },
  },
]

export function getCompetitor(slug: string): Competitor | undefined {
  return COMPETITORS.find((c) => c.slug === slug)
}
