"use client";

import { useState } from "react";
import { Bot, Copy, Check, X } from "lucide-react";
import {
  ModalMinimizeButton,
  useModalWindow,
} from "@/components/ui/modal-window";

interface AgentIntroModalProps {
  isOpen: boolean;
  onClose: () => void;
  prompt: string;
}

export function AgentIntroModal({ isOpen, onClose, prompt }: AgentIntroModalProps) {
  const modalWindow = useModalWindow({
    title: "Agents",
    onRequestClose: onClose,
  });
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = prompt;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  if (modalWindow.minimized) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        style={modalWindow.panelStyle}
        className="relative z-10 w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl"
      >
        <div
          {...modalWindow.dragHandleProps}
          aria-hidden
          className="absolute inset-x-0 top-0 z-0 h-12 rounded-t-xl"
        />
        <ModalMinimizeButton
          onMinimize={modalWindow.minimize}
          className="absolute right-12 top-4 z-20"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 text-zinc-500 hover:text-zinc-200"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-theme-gradient text-white">
            <Bot className="h-5 w-5" />
          </span>
          <h2 className="text-lg font-semibold text-white">
            Give your AI Agents access to Forge
          </h2>
        </div>

        <p className="mt-4 text-sm text-zinc-300">
          If you&rsquo;d like to give your AI Agents access to managing Forge, you
          can copy the prompt below and provide it to your Agent. It includes a
          personal access token named <code>default</code> (valid for one year).
          For your security, this token is shown only once.
        </p>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-zinc-500">
              Agent prompt
            </span>
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" /> Copy prompt
                </>
              )}
            </button>
          </div>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-200">
            {prompt}
          </pre>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Done
          </button>
          <button
            type="button"
            onClick={copy}
            className="rounded-lg bg-theme-gradient px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            {copied ? "Copied!" : "Copy prompt"}
          </button>
        </div>
      </div>
    </div>
  );
}
