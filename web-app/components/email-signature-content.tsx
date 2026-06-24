"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { EmailHtmlContent } from "@/components/ui/email-html-content";
import { RichTextContent } from "@/components/ui/rich-text-content";
import type { EmailHtmlRenderMode } from "@/lib/email-html-render-mode";
import { extractEmailSignatureContentParts } from "@/lib/email-signature-display";
import { cn } from "@/lib/utils";

type EmailSignatureContentProps = {
  html?: string | null;
  text?: string | null;
  contentKind?: "email" | "rich_text";
  hideSignatures?: boolean;
  renderMode?: EmailHtmlRenderMode;
  contentClassName?: string;
  collapsedClassName?: string;
  signatureClassName?: string;
};

export function EmailSignatureContent({
  html,
  text,
  contentKind = "email",
  hideSignatures = true,
  renderMode = "preserve",
  contentClassName,
  collapsedClassName,
  signatureClassName,
}: EmailSignatureContentProps) {
  const [isOpen, setIsOpen] = useState(false);
  const parts = useMemo(
    () => extractEmailSignatureContentParts({ html, text }),
    [html, text],
  );

  useEffect(() => {
    setIsOpen(false);
  }, [html, text, hideSignatures]);

  const renderContent = (
    contentHtml?: string | null,
    contentText?: string | null,
    className?: string,
  ) => {
    if (contentHtml) {
      if (contentKind === "email" && renderMode === "preserve") {
        return <EmailHtmlContent html={contentHtml} className={className} />;
      }

      return <RichTextContent html={contentHtml} className={className} />;
    }

    if (contentText) {
      return (
        <div className={cn("break-words whitespace-pre-wrap", className)}>
          {contentText}
        </div>
      );
    }

    return null;
  };

  if (!parts.hasSignature || !hideSignatures) {
    return renderContent(parts.bodyHtml, parts.bodyText, contentClassName);
  }

  return (
    <div>
      {renderContent(parts.bodyHtml, parts.bodyText, contentClassName)}
      <div className={cn("mt-4", collapsedClassName)}>
        <div
          className={cn(
            "overflow-hidden transition-all duration-200",
            isOpen ? "mb-3 max-h-[2000px] opacity-100" : "max-h-0 opacity-0",
          )}
        >
          {renderContent(
            parts.signatureHtml,
            parts.signatureText,
            signatureClassName || contentClassName,
          )}
        </div>
        <div className="relative flex items-center justify-center">
          <span
            aria-hidden
            className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-zinc-800"
          />
          <button
            type="button"
            onClick={() => setIsOpen((current) => !current)}
            aria-expanded={isOpen}
            aria-label={isOpen ? "Hide email signature" : "Show email signature"}
            className="relative inline-flex h-6 w-10 items-center justify-center rounded-full border border-zinc-800 bg-zinc-950 text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-300"
          >
            {isOpen ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
