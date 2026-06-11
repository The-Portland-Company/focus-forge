import Link from "next/link";
import type { Metadata } from "next";
import { IBM_Plex_Mono, Instrument_Sans, Instrument_Serif } from "next/font/google";

export const metadata: Metadata = {
  title: "Focus: Time for macOS — Focus Forge",
  description:
    "A native menu-bar timekeeper for Focus Forge. Start and stop timers from the macOS menu bar and attribute every minute to your organizations, projects, and tasks.",
};

const sans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-ft-sans",
});

const serif = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-ft-serif",
});

const mono = IBM_Plex_Mono({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-ft-mono",
});

const RELEASES_ENDPOINT =
  "https://api.github.com/repos/s3w47m88/focus-forge/releases/latest";

type ReleaseAsset = {
  name?: string;
  browser_download_url?: string;
};

type MacDownload = {
  url: string;
  version: string | null;
  kind: "dmg" | "zip";
};

async function getMacDownload(): Promise<MacDownload | null> {
  try {
    const res = await fetch(RELEASES_ENDPOINT, {
      next: { revalidate: 3600 },
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return null;
    const release = (await res.json()) as {
      tag_name?: string;
      assets?: ReleaseAsset[];
    };
    const assets = Array.isArray(release?.assets) ? release.assets : [];
    const dmg = assets.find((a) => /\.dmg$/i.test(a?.name ?? ""));
    const zip = assets.find((a) => /\.zip$/i.test(a?.name ?? ""));
    const asset = dmg ?? zip;
    if (!asset?.browser_download_url) return null;
    return {
      url: asset.browser_download_url,
      version:
        typeof release.tag_name === "string" && release.tag_name.length > 0
          ? release.tag_name
          : null,
      kind: dmg ? "dmg" : "zip",
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Page-scoped CSS: typography hooks, load choreography, instrument    */
/* details (tick rulers, blinking colon, grain). CSS-only on purpose — */
/* this page ships as a server component with zero client JS.          */
/* ------------------------------------------------------------------ */
const pageCss = `
.ft-sans { font-family: var(--font-ft-sans), ui-sans-serif, system-ui, sans-serif; }
.ft-serif { font-family: var(--font-ft-serif), ui-serif, Georgia, serif; }
.ft-mono { font-family: var(--font-ft-mono), ui-monospace, SFMono-Regular, Menlo, monospace; }

@keyframes ft-rise {
  to { opacity: 1; transform: translateY(0); }
}
.ft-reveal {
  opacity: 0;
  transform: translateY(16px);
  animation: ft-rise 0.8s cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
}

@keyframes ft-blink { 50% { opacity: 0.2; } }
.ft-blink { animation: ft-blink 1s steps(1, end) infinite; }

@keyframes ft-pulse { 50% { opacity: 0.35; } }
.ft-pulse { animation: ft-pulse 2s ease-in-out infinite; }

/* Watch-bezel tick ruler: fine tick every 9px, tall tick every 72px. */
.ft-ticks {
  background-image:
    linear-gradient(90deg, rgba(244, 244, 245, 0.13) 0 1px, transparent 1px),
    linear-gradient(90deg, rgba(244, 244, 245, 0.32) 0 1px, transparent 1px);
  background-size: 9px 9px, 72px 20px;
  background-repeat: repeat-x;
  background-position: bottom left;
}

.ft-grain {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E");
  opacity: 0.05;
}

@media (prefers-reduced-motion: reduce) {
  .ft-reveal { opacity: 1; transform: none; animation: none; }
  .ft-blink, .ft-pulse { animation: none; }
}
`;

function AppleGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.03 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}

/** Faux macOS menu bar + dropdown — the product, drawn in CSS. */
function MenuBarMock() {
  return (
    <div
      aria-hidden="true"
      className="relative select-none overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-900 via-zinc-950 to-zinc-950 shadow-[0_40px_120px_-40px_rgba(16,185,129,0.25)]"
    >
      {/* Desktop wallpaper wash */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_120%_at_70%_-20%,rgba(16,185,129,0.10),transparent_60%)]" />

      {/* Menu bar */}
      <div className="relative flex h-9 items-center justify-between border-b border-white/10 bg-zinc-900/80 px-4 text-[12px] text-zinc-400 backdrop-blur">
        <div className="flex items-center gap-4">
          <AppleGlyph className="h-3.5 w-3.5 text-zinc-300" />
          <span className="font-semibold text-zinc-200">Finder</span>
          <span className="hidden sm:inline">File</span>
          <span className="hidden sm:inline">Edit</span>
          <span className="hidden md:inline">View</span>
          <span className="hidden md:inline">Go</span>
          <span className="hidden md:inline">Window</span>
          <span className="hidden lg:inline">Help</span>
        </div>
        <div className="flex items-center gap-3">
          {/* The Focus: Time pill — the whole product in 90 pixels */}
          <span className="ft-mono flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium tabular-nums text-emerald-300">
            <span className="ft-pulse inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            01:42:07
          </span>
          <span className="ft-mono hidden tabular-nums text-zinc-400 sm:inline">
            Wed Jun 10
          </span>
          <span className="ft-mono tabular-nums text-zinc-300">9:41 AM</span>
        </div>
      </div>

      {/* Dropdown panel anchored under the pill */}
      <div className="relative flex justify-end px-4 pb-10 pt-3 sm:px-6">
        <div
          className="ft-reveal w-full max-w-[320px] rounded-xl border border-white/10 bg-zinc-900/95 shadow-2xl shadow-black/60"
          style={{ animationDelay: "0.55s" }}
        >
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-2.5">
            <span className="ft-mono flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-400">
              <span className="ft-pulse inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Running
            </span>
            <span className="ft-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              Focus: Time
            </span>
          </div>

          <div className="px-4 pb-1 pt-3">
            <p className="ft-mono text-[32px] font-medium leading-none tabular-nums text-zinc-50">
              01<span className="ft-blink text-emerald-400">:</span>42
              <span className="ft-blink text-emerald-400">:</span>07
            </p>
          </div>

          <dl className="space-y-1.5 px-4 py-3 text-[12px]">
            <div className="flex items-baseline gap-3">
              <dt className="ft-mono w-14 shrink-0 text-[9px] uppercase tracking-[0.2em] text-zinc-500">
                Org
              </dt>
              <dd className="truncate text-zinc-200">The Portland Company</dd>
            </div>
            <div className="flex items-baseline gap-3">
              <dt className="ft-mono w-14 shrink-0 text-[9px] uppercase tracking-[0.2em] text-zinc-500">
                Project
              </dt>
              <dd className="truncate text-zinc-200">Website Rebuild</dd>
            </div>
            <div className="flex items-baseline gap-3">
              <dt className="ft-mono w-14 shrink-0 text-[9px] uppercase tracking-[0.2em] text-zinc-500">
                List
              </dt>
              <dd className="truncate text-zinc-200">Sprint 12</dd>
            </div>
            <div className="flex items-start gap-3 pt-0.5">
              <dt className="ft-mono w-14 shrink-0 pt-1 text-[9px] uppercase tracking-[0.2em] text-zinc-500">
                Tasks
              </dt>
              <dd className="flex flex-wrap gap-1">
                <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[11px] text-zinc-300">
                  Hero copy pass
                </span>
                <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[11px] text-zinc-300">
                  Nav QA
                </span>
                <span className="ft-mono rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300">
                  2 tasks
                </span>
              </dd>
            </div>
          </dl>

          <div className="flex gap-2 border-t border-white/5 px-4 py-3">
            <span className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-500/15 py-1.5 text-[12px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
              <span className="inline-block h-2 w-2 rounded-[2px] bg-current" />
              Stop
            </span>
            <span className="flex flex-1 items-center justify-center rounded-lg py-1.5 text-[12px] text-zinc-400 ring-1 ring-inset ring-white/10">
              Switch task
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Horizontal tick ruler with hour labels — the page's timekeeping motif. */
function TickRuler() {
  const hours = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];
  return (
    <div aria-hidden="true" className="select-none">
      <div className="ft-mono flex justify-between text-[9px] uppercase tracking-[0.18em] text-zinc-600">
        {hours.map((h, i) => (
          <span key={h} className={i % 2 === 1 ? "hidden sm:inline" : undefined}>
            {h}
          </span>
        ))}
      </div>
      <div className="ft-ticks mt-1.5 h-5 w-full" />
    </div>
  );
}

const FEATURES = [
  {
    index: "01",
    kicker: "In the bar",
    title: "Lives in the menu bar",
    body: "Start, stop, and switch timers without leaving whatever you are doing. One running timer, always in sight — and when you forget to clock in, log a manual entry with an explicit start and end.",
  },
  {
    index: "02",
    kicker: "One source of truth",
    title: "Synced with Focus Forge",
    body: "Sign in with a personal access token and every entry lands in your Focus Forge workspace, attributed to the organization, project, and task list it belongs to. Forge stays the source of truth.",
  },
  {
    index: "03",
    kicker: "Honest attribution",
    title: "One block, many tasks",
    body: "A single entry can carry more than one task, because real work does too. Filter history by organization, project, list, tasks, or date range to see where the week actually went.",
  },
];

export default async function DesktopLandingPage() {
  const download = await getMacDownload();
  const year = new Date().getFullYear();

  return (
    <main
      className={`${sans.variable} ${serif.variable} ${mono.variable} ft-sans relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-300 antialiased`}
    >
      <style>{pageCss}</style>

      {/* Atmosphere: emerald horizon glow + grain */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[640px] bg-[radial-gradient(60%_80%_at_50%_-20%,rgba(16,185,129,0.13),transparent_70%)]"
      />
      <div aria-hidden="true" className="ft-grain pointer-events-none absolute inset-0" />

      <div className="relative mx-auto max-w-5xl px-6">
        {/* ---------------------------------------------------------- */}
        {/* Nav                                                         */}
        {/* ---------------------------------------------------------- */}
        <header className="flex items-center justify-between border-b border-white/5 py-6">
          <p className="flex items-baseline gap-2">
            <span className="ft-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-400">
              Focus:
            </span>
            <span className="ft-serif text-2xl italic leading-none text-zinc-50">Time</span>
          </p>
          <nav className="ft-mono flex items-center gap-5 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            <Link href="/privacy" className="transition-colors hover:text-zinc-200">
              Privacy
            </Link>
            <Link href="/support" className="transition-colors hover:text-zinc-200">
              Support
            </Link>
            <Link
              href="/"
              className="rounded-full border border-white/10 px-3 py-1.5 text-zinc-300 transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
            >
              Open Forge
            </Link>
          </nav>
        </header>

        {/* ---------------------------------------------------------- */}
        {/* Hero                                                        */}
        {/* ---------------------------------------------------------- */}
        <section className="pb-16 pt-16 sm:pt-24">
          <p
            className="ft-mono ft-reveal text-[11px] font-medium uppercase tracking-[0.32em] text-emerald-400"
            style={{ animationDelay: "0.05s" }}
          >
            Native macOS companion
          </p>
          <h1
            className="ft-serif ft-reveal mt-5 max-w-3xl text-5xl leading-[1.04] text-zinc-50 sm:text-7xl"
            style={{ animationDelay: "0.14s" }}
          >
            Know where the <em className="text-emerald-300">time</em> went.
          </h1>
          <p
            className="ft-reveal mt-6 max-w-xl text-lg leading-relaxed text-zinc-400"
            style={{ animationDelay: "0.24s" }}
          >
            Focus: Time is the menu-bar timekeeper for Focus Forge. Start a timer
            in one click and every minute is pinned to the organization, project,
            and tasks it belongs to — synced straight into your Forge workspace.
          </p>

          <div
            className="ft-reveal mt-9 flex flex-wrap items-center gap-4"
            style={{ animationDelay: "0.34s" }}
          >
            {download ? (
              <a
                href={download.url}
                className="ft-mono group inline-flex items-center gap-2.5 rounded-full bg-emerald-400 px-6 py-3 text-[13px] font-semibold uppercase tracking-[0.14em] text-zinc-950 transition-colors hover:bg-emerald-300"
              >
                <AppleGlyph className="h-4 w-4 -translate-y-px" />
                Download for macOS
                <span className="text-emerald-900/70 transition-transform group-hover:translate-x-0.5">
                  ↓
                </span>
              </a>
            ) : (
              <span
                aria-disabled="true"
                className="ft-mono inline-flex cursor-default items-center gap-2.5 rounded-full border border-dashed border-zinc-700 px-6 py-3 text-[13px] font-medium uppercase tracking-[0.14em] text-zinc-400"
              >
                <span className="ft-pulse inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
                macOS build coming soon
              </span>
            )}
            <Link
              href="/"
              className="ft-mono text-[12px] uppercase tracking-[0.16em] text-zinc-500 underline decoration-zinc-700 underline-offset-4 transition-colors hover:text-emerald-300 hover:decoration-emerald-500/50"
            >
              Track time in Focus Forge →
            </Link>
          </div>
          <p
            className="ft-mono ft-reveal mt-4 text-[11px] tracking-wide text-zinc-600"
            style={{ animationDelay: "0.4s" }}
          >
            {download ? (
              <>
                {download.version ? `${download.version} · ` : ""}
                Direct {download.kind === "dmg" ? ".dmg" : ".zip"} download · Built
                for Focus Forge accounts
              </>
            ) : (
              <>
                Builds ship through GitHub Releases — this page links the first
                one automatically the moment it lands.
              </>
            )}
          </p>

          <div className="ft-reveal mt-14" style={{ animationDelay: "0.46s" }}>
            <MenuBarMock />
            <p className="ft-mono mt-3 text-center text-[10px] uppercase tracking-[0.24em] text-zinc-600">
              Menu-bar timer · attributed to your Forge workspace
            </p>
          </div>
        </section>

        {/* ---------------------------------------------------------- */}
        {/* Tick ruler divider                                          */}
        {/* ---------------------------------------------------------- */}
        <TickRuler />

        {/* ---------------------------------------------------------- */}
        {/* Feature trio                                                */}
        {/* ---------------------------------------------------------- */}
        <section className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-white/5 bg-white/5 md:grid-cols-3">
          {FEATURES.map((feature) => (
            <article
              key={feature.index}
              className="group bg-zinc-950 p-7 transition-colors hover:bg-zinc-900/60"
            >
              <div className="flex items-baseline justify-between">
                <span className="ft-mono text-[11px] font-semibold tabular-nums text-emerald-400">
                  {feature.index}
                </span>
                <span className="ft-mono text-[9px] uppercase tracking-[0.24em] text-zinc-600 transition-colors group-hover:text-zinc-500">
                  {feature.kicker}
                </span>
              </div>
              <h2 className="ft-serif mt-5 text-2xl text-zinc-50">{feature.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-zinc-400">{feature.body}</p>
            </article>
          ))}
        </section>

        {/* ---------------------------------------------------------- */}
        {/* Works with Focus Forge                                      */}
        {/* ---------------------------------------------------------- */}
        <section className="mt-24 grid items-center gap-12 border-t border-white/5 pt-16 md:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="ft-mono text-[11px] font-medium uppercase tracking-[0.32em] text-emerald-400">
              Works with Focus Forge
            </p>
            <h2 className="ft-serif mt-4 text-4xl leading-tight text-zinc-50">
              Not another silo. <em>A native client.</em>
            </h2>
            <p className="mt-5 max-w-md leading-relaxed text-zinc-400">
              Focus: Time speaks the Focus Forge time-tracking API directly.
              Entries are stored in UTC with your timezone preserved, one timer
              runs at a time, and organization tokens carry scoped read and write
              access — so what you see in the menu bar is exactly what your team
              sees in Forge.
            </p>
            <ul className="ft-mono mt-7 space-y-2.5 text-[12px] tracking-wide text-zinc-500">
              <li className="flex items-center gap-3">
                <span className="h-px w-6 bg-emerald-500/50" />
                Personal access token sign-in
              </li>
              <li className="flex items-center gap-3">
                <span className="h-px w-6 bg-emerald-500/50" />
                UTC timestamps, your timezone preserved
              </li>
              <li className="flex items-center gap-3">
                <span className="h-px w-6 bg-emerald-500/50" />
                One running timer, zero double-counting
              </li>
            </ul>
          </div>

          {/* Sync trace card */}
          <div
            aria-hidden="true"
            className="select-none rounded-2xl border border-white/10 bg-zinc-900/60 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)]"
          >
            <div className="flex items-center gap-1.5 border-b border-white/5 px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
              <span className="ft-mono ml-3 text-[10px] uppercase tracking-[0.2em] text-zinc-600">
                sync log
              </span>
            </div>
            <div className="ft-mono space-y-1.5 px-5 py-5 text-[12px] leading-relaxed">
              <p className="text-zinc-300">
                POST /api/v1/time/entries{" "}
                <span className="float-right text-emerald-400">201</span>
              </p>
              <p className="text-zinc-500">
                <span className="text-zinc-600">org</span> the-portland-company
              </p>
              <p className="text-zinc-500">
                <span className="text-zinc-600">project</span> website-rebuild
              </p>
              <p className="text-zinc-500">
                <span className="text-zinc-600">tasks</span> [hero-copy-pass, nav-qa]
              </p>
              <p className="text-zinc-500">
                <span className="text-zinc-600">started</span> 2026-06-10T16:02:11Z
              </p>
              <p className="pt-2 text-emerald-400">
                ▸ timer running <span className="ft-blink">·</span> synced to Forge
              </p>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- */}
        {/* Footer                                                      */}
        {/* ---------------------------------------------------------- */}
        <footer className="mt-24 border-t border-white/5 py-10">
          <div className="ft-mono flex flex-col items-start justify-between gap-4 text-[11px] uppercase tracking-[0.18em] text-zinc-600 sm:flex-row sm:items-center">
            <p>
              © {year} The Portland Company{" "}
              <span className="mx-1 text-zinc-800">/</span> Focus: Time for macOS
            </p>
            <nav className="flex items-center gap-5">
              <Link href="/privacy" className="transition-colors hover:text-zinc-300">
                Privacy
              </Link>
              <Link href="/support" className="transition-colors hover:text-zinc-300">
                Support
              </Link>
              <Link href="/" className="transition-colors hover:text-emerald-300">
                Focus Forge
              </Link>
            </nav>
          </div>
        </footer>
      </div>
    </main>
  );
}
