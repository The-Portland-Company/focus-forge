"use client";

import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import {
  classifyAttachmentKind,
  type AttachmentKind,
} from "@/lib/email-inbox/attachments";

type AttachmentDocPreviewProps = {
  url: string;
  filename?: string | null;
  contentType?: string | null;
  /** Optional explicit kind; otherwise derived from filename/contentType. */
  kind?: AttachmentKind;
  className?: string;
};

type SheetTable = { name: string; html: string };
type PptxSlide = { title: string | null; lines: string[] };

/**
 * Extract readable text from every slide of a PPTX (OOXML) by unzipping it and
 * pulling the `<a:t>` runs out of each slide's XML, in slide order. This is a
 * robust, dependency-light preview: it works for any valid .pptx (unlike
 * canvas/DOM renderers that choke on many generators) and shows the user the
 * actual slide content.
 */
async function extractPptxSlides(buffer: ArrayBuffer): Promise<PptxSlide[]> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(buffer);

  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => {
      const n = (p: string) => Number(p.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
      return n(a) - n(b);
    });

  const slides: PptxSlide[] = [];
  for (const path of slidePaths) {
    const xml = await zip.files[path].async("string");
    // Split into paragraphs (<a:p>) so bullets/lines stay separated, then pull
    // the text runs (<a:t>...</a:t>) from each and decode XML entities.
    const paragraphs = xml.split(/<a:p[ >]/).slice(1);
    const lines: string[] = [];
    for (const para of paragraphs) {
      const runs = [...para.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) =>
        m[1]
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'"),
      );
      const text = runs.join("").trim();
      if (text) lines.push(text);
    }
    slides.push({ title: lines[0] ?? null, lines: lines.slice(1) });
  }
  return slides;
}

// Scoped styling for the raw HTML emitted by mammoth (DOCX) and SheetJS (XLSX),
// which arrives unstyled. Keeps the rendered document readable and spreadsheet
// tables gridded, matching how the source file actually looks.
const OFFICE_STYLES = `
.office-docx-body { line-height: 1.6; font-size: 15px; }
.office-docx-body p { margin: 0 0 0.75em; }
.office-docx-body h1,.office-docx-body h2,.office-docx-body h3 { font-weight: 600; margin: 1em 0 0.5em; }
.office-docx-body ul,.office-docx-body ol { margin: 0 0 0.75em 1.5em; }
.office-docx-body table { border-collapse: collapse; margin: 0.75em 0; }
.office-docx-body td,.office-docx-body th { border: 1px solid #cbd5e1; padding: 4px 8px; }
.office-docx-body img { max-width: 100%; height: auto; }
.office-docx-body a { color: #2563eb; text-decoration: underline; }
.office-xlsx-body table { border-collapse: collapse; font-size: 13px; }
.office-xlsx-body td,.office-xlsx-body th { border: 1px solid #d1d5db; padding: 3px 8px; white-space: nowrap; }
.office-xlsx-body tr:first-child td { background: #f3f4f6; font-weight: 600; }
`;

async function fetchBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`Failed to load attachment (${response.status})`);
  }
  return response.arrayBuffer();
}

/**
 * Renders office documents (DOCX, XLSX/CSV, PPTX) and PDFs inline so the user
 * can actually preview them instead of downloading. Parsing libraries are
 * dynamically imported so they stay out of the main bundle and only load when a
 * document of that type is opened.
 */
export function AttachmentDocPreview({
  url,
  filename,
  contentType,
  kind: kindProp,
  className,
}: AttachmentDocPreviewProps) {
  const kind =
    kindProp ?? classifyAttachmentKind({ contentType, filename });

  const [loading, setLoading] = useState(kind !== "pdf");
  const [error, setError] = useState<string | null>(null);
  const [docHtml, setDocHtml] = useState<string | null>(null);
  const [sheets, setSheets] = useState<SheetTable[] | null>(null);
  const [activeSheet, setActiveSheet] = useState(0);
  const [slides, setSlides] = useState<PptxSlide[] | null>(null);

  useEffect(() => {
    if (kind === "pdf") return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setDocHtml(null);
    setSheets(null);
    setSlides(null);
    setActiveSheet(0);

    (async () => {
      try {
        if (kind === "docx") {
          const [{ default: mammoth }, { default: DOMPurify }, buffer] =
            await Promise.all([
              import("mammoth/mammoth.browser"),
              import("isomorphic-dompurify"),
              fetchBuffer(url),
            ]);
          const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
          if (cancelled) return;
          setDocHtml(DOMPurify.sanitize(result.value || "<p></p>"));
        } else if (kind === "xlsx") {
          const [XLSX, { default: DOMPurify }, buffer] = await Promise.all([
            import("xlsx"),
            import("isomorphic-dompurify"),
            fetchBuffer(url),
          ]);
          const workbook = XLSX.read(buffer, { type: "array" });
          const tables: SheetTable[] = workbook.SheetNames.map((name) => ({
            name,
            html: DOMPurify.sanitize(
              XLSX.utils.sheet_to_html(workbook.Sheets[name], {
                id: "sheet-table",
              }),
            ),
          }));
          if (cancelled) return;
          setSheets(tables.length ? tables : [{ name: "Sheet1", html: "" }]);
        } else if (kind === "pptx") {
          const buffer = await fetchBuffer(url);
          const extracted = await extractPptxSlides(buffer);
          if (cancelled) return;
          setSlides(extracted);
        }
        if (!cancelled) setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to render preview",
          );
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [kind, url]);

  if (kind === "pdf") {
    return (
      <iframe
        src={url}
        title={filename || "PDF preview"}
        className={
          className ??
          "h-full w-full rounded-lg border border-zinc-800 bg-white"
        }
      />
    );
  }

  const wrapper =
    className ??
    "h-full w-full overflow-auto rounded-lg border border-zinc-800 bg-zinc-950";

  if (loading) {
    return (
      <div className={`${wrapper} flex items-center justify-center`}>
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Rendering preview…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${wrapper} flex items-center justify-center p-6`}>
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="text-sm text-rose-300">
            Couldn&apos;t render this file inline.
          </div>
          <div className="max-w-md text-xs text-zinc-500">{error}</div>
          <a
            href={url}
            download={filename || undefined}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white"
          >
            <Download className="h-4 w-4" />
            Download
          </a>
        </div>
      </div>
    );
  }

  if (kind === "docx" && docHtml !== null) {
    return (
      <div className={wrapper}>
        <style>{OFFICE_STYLES}</style>
        <div className="mx-auto max-w-4xl bg-white p-8 sm:p-12">
          <div
            className="office-docx-body text-zinc-900"
            // Sanitized above via DOMPurify.
            dangerouslySetInnerHTML={{ __html: docHtml }}
          />
        </div>
      </div>
    );
  }

  if (kind === "xlsx" && sheets) {
    const sheet = sheets[Math.min(activeSheet, sheets.length - 1)];
    return (
      <div className={`${wrapper} flex flex-col`}>
        <style>{OFFICE_STYLES}</style>
        {sheets.length > 1 ? (
          <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-zinc-800 bg-zinc-900/70 p-1.5">
            {sheets.map((s, index) => (
              <button
                key={s.name}
                type="button"
                onClick={() => setActiveSheet(index)}
                className={`shrink-0 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  index === activeSheet
                    ? "bg-zinc-700 text-white"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        ) : null}
        <div className="office-xlsx-body flex-1 overflow-auto bg-white p-4 text-zinc-900">
          <div dangerouslySetInnerHTML={{ __html: sheet?.html ?? "" }} />
        </div>
      </div>
    );
  }

  if (kind === "pptx" && slides) {
    if (slides.length === 0) {
      return (
        <div className={`${wrapper} flex items-center justify-center p-6`}>
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="text-sm text-zinc-300">
              No slide text could be extracted from this presentation.
            </div>
            <a
              href={url}
              download={filename || undefined}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white"
            >
              <Download className="h-4 w-4" />
              Download
            </a>
          </div>
        </div>
      );
    }
    return (
      <div className={`${wrapper} bg-zinc-900 p-4 sm:p-6`}>
        <div className="mx-auto flex max-w-4xl flex-col gap-4">
          {slides.map((slide, index) => (
            <div
              key={index}
              className="aspect-[16/9] w-full overflow-hidden rounded-lg border border-zinc-700 bg-white p-6 sm:p-10 text-zinc-900 shadow-lg"
            >
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                Slide {index + 1}
              </div>
              {slide.title ? (
                <div className="mb-4 text-xl font-bold sm:text-2xl">
                  {slide.title}
                </div>
              ) : null}
              <ul className="space-y-1.5 text-sm sm:text-base">
                {slide.lines.map((line, i) => (
                  <li key={i} className="leading-snug">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}
