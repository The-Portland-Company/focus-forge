// Shared, user-facing help copy for the Domino Effect / Stakes feature.
// Used by the Domino Board help panel + empty state and the Stakes "?" tooltip
// in the task editor, so the explanation stays consistent everywhere.

export const STAKE_WHAT_IS =
  "A stake is what's riding on a task — a consequence you want to avoid or a reward you're chasing. Add one and the task becomes a “domino”: the Domino Board then shows what falls, and what it costs, if the task slips.";

// Three concrete, representative examples of stakes the feature supports.
export const STAKE_EXAMPLES: {
  emoji: string;
  label: string;
  text: string;
}[] = [
  {
    emoji: "💸",
    label: "Consequence",
    text: "“Late fee — $40/week” on “Pay the storage unit”, due Friday. Miss it and it costs you $40 every week it stays unpaid.",
  },
  {
    emoji: "🎯",
    label: "Reward",
    text: "“$500 project bonus” on “Ship the redesign”, earned if you finish by Jun 30.",
  },
  {
    emoji: "⛓️",
    label: "Chain",
    text: "“Miss laundry day” → “Can’t drive rideshare” → “Lose $300 in fares.” One slip topples the next — the board shows the whole cascade before it happens.",
  },
];

// Richer explainer for the Domino Board (header "?" popover + empty state).
export const DOMINO_BOARD_INTRO =
  "The Domino Board shows what’s at risk across your tasks. Each task you add a stake to becomes a domino; the board lines them up so you can see what falls — and what it costs — if a task slips.";

export const DOMINO_BOARD_POINTS: { term: string; detail: string }[] = [
  {
    term: "Stake",
    detail:
      "A consequence to avoid or a reward to win, attached to a task (e.g. a $40/week late fee, or a $500 bonus).",
  },
  {
    term: "Fall date",
    detail:
      "When the stake comes due. As the date nears, the domino grows more urgent; once it passes, it “falls.”",
  },
  {
    term: "Resolver task",
    detail:
      "The work that keeps a domino standing. “Defuses once” handles a single instance; “Eliminates” clears a recurring stake for good.",
  },
  {
    term: "Chain",
    detail:
      "Link one stake to another so a slip cascades — the board shows the knock-on effects before they happen.",
  },
];

export const DOMINO_BOARD_GET_STARTED =
  "Get started: open a task, scroll to Stakes, add a consequence or reward, and give it a fall date. It’ll show up here as a domino.";
