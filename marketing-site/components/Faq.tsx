// Plain semantic FAQ — direct question/answer pairs for AIO + answer engines.
// Mirrored into FAQPage JSON-LD on the home page.
export const FAQ_ITEMS = [
  {
    q: "What is Focus Forge?",
    a: "Focus Forge is a task and project management app with a built-in AI agent. It works like a fast, dark-first Todoist, but is designed to be driven by AI agents — including autonomous Claude Code loops that clear your backlog through pull requests.",
  },
  {
    q: "How does the autonomous loop work?",
    a: "You run a recurring Claude Code command that watches Focus Forge for new or open tasks. It spawns a team of subagents, completes each task as a pull request, and verifies the work deploys to staging and production — all without manual prompting.",
  },
  {
    q: "What platforms does Focus Forge run on?",
    a: "Focus Forge runs on the web in any modern browser, plus native iOS and macOS apps that sync to the same account.",
  },
  {
    q: "What are DevNotes?",
    a: "DevNotes is structured, machine-readable metadata attached to a task — like branch names, PR numbers, and deploy status. It's stored separately from the visible description so agents and tooling can report progress without cluttering what you read.",
  },
  {
    q: "Who makes Focus Forge?",
    a: "Focus Forge is built by The Portland Company in Portland, Oregon.",
  },
]

export function Faq() {
  return (
    <section id="faq" className="py-20">
      <div className="mx-auto max-w-3xl px-5">
        <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
          Frequently asked questions
        </h2>
        <div className="mt-10 divide-y divide-border rounded-xl border border-border">
          {FAQ_ITEMS.map((item) => (
            <details key={item.q} className="group p-5 [&_summary]:cursor-pointer">
              <summary className="flex list-none items-center justify-between font-medium">
                {item.q}
                <span className="ml-4 text-muted-foreground transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-pretty text-sm text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
