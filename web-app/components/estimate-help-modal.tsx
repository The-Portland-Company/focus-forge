"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, HelpCircle, ShieldCheck, Sparkles, X } from "lucide-react";

export interface EstimateHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Shared explainer for how AI time estimates are produced. Wording is grounded
 * in the actual implementation:
 *  - lib/ai-estimator/server.ts — OpenAI gpt-4.1-mini, JSON-schema output,
 *    few-shot calibrations injected into the prompt (no fine-tuning).
 *  - lib/ai-estimator/examples.ts — calibrations come from THIS user's own
 *    accepted estimates (task_estimate_examples), project-aware.
 *  - lib/ai-memory/retrieval.ts — per-user vector match of similar past
 *    estimate judgments, embedded from redacted text.
 * Keep this copy accurate; do not assert capabilities the code does not have.
 */
export function EstimateHelpModal({ isOpen, onClose }: EstimateHelpModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg text-zinc-200 [&>button.absolute]:rounded-full [&>button.absolute]:border [&>button.absolute]:border-zinc-700 [&>button.absolute]:bg-zinc-800 [&>button.absolute]:p-1.5 [&>button.absolute]:text-zinc-300 [&>button.absolute]:opacity-100 [&>button.absolute]:transition-colors [&>button.absolute]:hover:border-zinc-500 [&>button.absolute]:hover:bg-zinc-700 [&>button.absolute]:hover:text-white">
        <DialogHeader>
          <DialogTitle>
            <span className="inline-flex items-center gap-2 text-white">
              <Sparkles className="w-4 h-4 text-[rgb(var(--theme-primary-rgb))]" />
              How AI estimates are made
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 text-sm leading-relaxed">
          <p className="text-zinc-400">
            Estimates come from a general-purpose large language model
            (OpenAI&rsquo;s GPT-4.1&nbsp;mini). It is{" "}
            <span className="text-zinc-200">not a model trained or fine-tuned on your data</span>
            . Instead, each suggestion is shaped in-context by examples we put in
            the prompt at the moment you ask &mdash; the model&rsquo;s underlying
            weights never change.
          </p>

          {/* What informs your estimates */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
            <h3 className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-white">
              <Check className="w-4 h-4 text-emerald-400" />
              What informs your estimates
            </h3>
            <ul className="space-y-2 text-zinc-400">
              <li className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-zinc-600" />
                <span>
                  The task you&rsquo;re estimating: its{" "}
                  <span className="text-zinc-200">title and description</span>,
                  plus context like project, priority, tags, due date, and
                  subtasks when present.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-zinc-600" />
                <span>
                  <span className="text-zinc-200">Your own accepted estimates</span>{" "}
                  &mdash; every time you approve or correct a duration, we save
                  it as a calibration. Your most recent ones (project-matched
                  first) are added to the prompt as examples of your real pace.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-zinc-600" />
                <span>
                  <span className="text-zinc-200">Similar past decisions from your AI memory</span>{" "}
                  &mdash; we find prior estimate judgments of yours that resemble
                  this task and include them as precedents.
                </span>
              </li>
            </ul>
            <p className="mt-3 text-xs text-zinc-500">
              In short: the AI learns your patterns through examples placed in
              the prompt (few-shot), not by retraining. If subtasks already have
              estimates, the parent is simply their sum &mdash; no AI call.
            </p>
          </div>

          {/* What we DON'T do */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
            <h3 className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-white">
              <ShieldCheck className="w-4 h-4 text-[rgb(var(--theme-primary-rgb))]" />
              What we DON&rsquo;T do
            </h3>
            <ul className="space-y-2 text-zinc-400">
              <li className="flex gap-2">
                <X className="mt-0.5 w-4 h-4 shrink-0 text-red-400" />
                <span>
                  We don&rsquo;t train or fine-tune the model on your data. Your
                  examples live only in the prompt for that single request.
                </span>
              </li>
              <li className="flex gap-2">
                <X className="mt-0.5 w-4 h-4 shrink-0 text-red-400" />
                <span>
                  We don&rsquo;t mix your data with anyone else&rsquo;s. Your
                  calibrations and memory are retrieved per account, scoped to
                  you.
                </span>
              </li>
              <li className="flex gap-2">
                <X className="mt-0.5 w-4 h-4 shrink-0 text-red-400" />
                <span>
                  We don&rsquo;t guarantee accuracy. An estimate is a heuristic
                  suggestion &mdash; you can override it, and your correction
                  becomes the calibration that informs the next one.
                </span>
              </li>
            </ul>
          </div>

          <p className="text-xs text-zinc-500">
            You stay in control: manage or delete your calibrations anytime in
            the <span className="text-zinc-300">AI Rules</span> tab, and every
            saved estimate is one you confirmed.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Small, reusable "?" trigger button matching the app's themed icon-button
 * style. Pairs with EstimateHelpModal.
 */
export function EstimateHelpButton({
  onClick,
  className = "",
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="How AI estimation works"
      title="How AI estimation works"
      className={`inline-flex items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 p-1.5 text-zinc-300 transition-colors hover:border-zinc-500 hover:bg-zinc-700 hover:text-white ${className}`}
    >
      <HelpCircle className="w-4 h-4" />
    </button>
  );
}
