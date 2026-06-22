import {
  Bot,
  Calendar,
  CheckSquare,
  FolderKanban,
  Mail,
} from "lucide-react"
import { AppShot } from "./AppShot"

const FEATURES = [
  {
    icon: CheckSquare,
    title: "Task management that gets out of the way",
    body: "Due dates, priorities, tags, subtasks, reminders, and recurring tasks — with a fast, keyboard-friendly Today and Upcoming view.",
    shot: { dark: "/media/screenshots/upcoming-dark.png", light: "/media/screenshots/upcoming-light.png", alt: "Upcoming tasks grouped by date" },
  },
  {
    icon: Bot,
    title: "A built-in AI agent",
    body: "Ask questions about any project and let the agent create, edit, and complete tasks for you — with a resilient 3-provider fallback so it keeps working.",
    shot: { dark: "/media/screenshots/assistant-dark.png", light: "/media/screenshots/assistant-light.png", alt: "AI assistant answering and creating tasks" },
  },
  {
    icon: FolderKanban,
    title: "Organizations & projects",
    body: "Group work across multiple organizations and projects, with favorites, archiving, drag-and-drop ordering, and role-based team access.",
    shot: { dark: "/media/screenshots/project-dark.png", light: "/media/screenshots/project-light.png", alt: "Project view with tasks and sections" },
  },
  {
    icon: Calendar,
    title: "Calendar & time-blocking",
    body: "See your tasks on a calendar, block time, and plan your day so the important work actually gets a slot.",
    shot: { dark: "/media/screenshots/calendar-dark.png", light: "/media/screenshots/calendar-light.png", alt: "Calendar view with time-blocked tasks" },
  },
  {
    icon: Mail,
    title: "Email, turned into tasks",
    body: "A connected inbox, drafts, and composer mean the messages that create work live next to the work itself.",
    shot: { dark: "/media/screenshots/email-dark.png", light: "/media/screenshots/email-light.png", alt: "Email inbox integrated with tasks" },
  },
]

export function FeatureGrid() {
  return (
    <section id="features" className="py-20">
      <div className="mx-auto max-w-6xl px-5">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Everything you need to plan and ship
          </h2>
          <p className="mt-4 text-pretty text-muted-foreground">
            A complete project manager underneath the AI — fast, dark-first, and
            mobile-ready.
          </p>
        </div>

        <div className="mt-14 space-y-20">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className="grid items-center gap-8 md:grid-cols-2 md:gap-12"
            >
              <div className={i % 2 === 1 ? "md:order-2" : ""}>
                <f.icon className="h-7 w-7 text-[rgb(var(--theme-primary-rgb))]" />
                <h3 className="mt-4 text-2xl font-semibold">{f.title}</h3>
                <p className="mt-3 text-muted-foreground">{f.body}</p>
              </div>
              <AppShot
                dark={f.shot.dark}
                alt={f.shot.alt}
                className={i % 2 === 1 ? "md:order-1" : ""}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
