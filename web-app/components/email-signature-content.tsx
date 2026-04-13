"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
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
      <div className={cn("group/signature mt-4", collapsedClassName)}>
        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          className={cn(
            "flex w-full items-center gap-3 text-[11px] uppercase tracking-[0.18em] text-zinc-500 transition-opacity duration-200",
            isOpen ? "opacity-100" : "opacity-0 group-hover/signature:opacity-100",
          )}
        >
          <span className="h-px flex-1 bg-zinc-800" />
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            {isOpen ? "Hide Email Signature" : "Reveal Email Signature"}
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")}
            />
          </span>
          <span className="h-px flex-1 bg-zinc-800" />
        </button>
        <div
          className={cn(
            "overflow-hidden transition-all duration-200",
            isOpen ? "mt-3 max-h-[2000px] opacity-100" : "max-h-0 opacity-0",
          )}
        >
          {renderContent(
            parts.signatureHtml,
            parts.signatureText,
            signatureClassName || contentClassName,
          )}
        </div>
      </div>
    </div>
  );
}
