/* eslint-disable @next/next/no-img-element */

const CLIPS = [
  {
    title: "Capture & complete",
    body: "Adding, organizing, and checking off tasks.",
    src: "/media/videos/tasks.webm",
    poster: "/media/posters/tasks.png",
  },
  {
    title: "Ask the agent",
    body: "The AI agent answers and creates tasks in context.",
    src: "/media/videos/agent.webm",
    poster: "/media/posters/agent.png",
  },
  {
    title: "Plan the day",
    body: "Calendar and time-blocking in action.",
    src: "/media/videos/calendar.webm",
    poster: "/media/posters/calendar.png",
  },
]

export function VideoShowcase() {
  return (
    <section className="border-t border-border bg-card/40 py-20">
      <div className="mx-auto max-w-6xl px-5">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">See it in motion</h2>
          <p className="mt-4 text-pretty text-muted-foreground">
            Short clips of the real app — no mockups.
          </p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {CLIPS.map((c) => (
            <figure key={c.title} className="overflow-hidden rounded-xl border border-border bg-background">
              <video
                className="aspect-video w-full bg-black object-cover"
                src={c.src}
                poster={c.poster}
                muted
                loop
                playsInline
                autoPlay
                preload="metadata"
                aria-label={c.title}
              />
              <figcaption className="p-4">
                <div className="font-semibold">{c.title}</div>
                <div className="text-sm text-muted-foreground">{c.body}</div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}
