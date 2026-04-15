"use client";

import Image from "next/image";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  FileText,
  ImageIcon,
  Loader2,
  MailPlus,
  Paperclip,
  SendHorizontal,
  X,
} from "lucide-react";
import { Tooltip } from "@/components/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { FloatingFieldLabel } from "@/components/ui/floating-field-label";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getApplicableEmailSignatures,
  getDefaultEmailSignature,
} from "@/lib/email-signatures";
import { formatReplyAttachmentSize } from "@/lib/email-reply";
import { hasRichTextContent, richTextToPlainText } from "@/lib/rich-text";
import type {
  EmailOutboundDraft,
  EmailReplyAddress,
  EmailReplyDraftAttachment,
  EmailSignature,
  Mailbox,
  Project,
} from "@/lib/types";

type ComposerAttachment = EmailReplyDraftAttachment & {
  previewUrl?: string | null;
  isImage?: boolean;
};

type EmailOutboundComposerModalProps = {
  open: boolean;
  mailboxes: Mailbox[];
  projects: Project[];
  signatures: EmailSignature[];
  selectedMailboxId: string;
  onOpenChange: (open: boolean) => void;
  onSent?: (result: { mailboxId: string; threadId?: string | null }) => void;
  onScheduled?: (draft: EmailOutboundDraft) => void;
};

function parseRecipientAddress(value: string): EmailReplyAddress | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const namedMatch = trimmed.match(/^(.*)<([^>]+)>$/);
  if (namedMatch) {
    const email = namedMatch[2]?.trim().toLowerCase();
    if (!email) return null;
    const name = namedMatch[1]?.trim().replace(/^"|"$/g, "") || null;
    return { email, name };
  }

  return {
    email: trimmed.toLowerCase(),
    name: null,
  };
}

function parseRecipientList(value: string) {
  return value
    .split(/[\n,;]+/)
    .map(parseRecipientAddress)
    .filter((entry): entry is EmailReplyAddress => Boolean(entry?.email));
}

export function EmailOutboundComposerModal({
  open,
  mailboxes,
  projects,
  signatures,
  selectedMailboxId,
  onOpenChange,
  onSent,
  onScheduled,
}: EmailOutboundComposerModalProps) {
  const [draftId, setDraftId] = useState<string | null>(null);
  const [mailboxId, setMailboxId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [toInput, setToInput] = useState("");
  const [ccInput, setCcInput] = useState("");
  const [bccInput, setBccInput] = useState("");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [selectedSignatureId, setSelectedSignatureId] = useState<string | null>(
    null,
  );
  const [busyState, setBusyState] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const applicableSignatures = useMemo(
    () => getApplicableEmailSignatures(signatures, mailboxId || null),
    [mailboxId, signatures],
  );
  const selectedSignature =
    applicableSignatures.find((signature) => signature.id === selectedSignatureId) ||
    null;

  useEffect(() => {
    if (!open) {
      setDraftId(null);
      setProjectId("");
      setToInput("");
      setCcInput("");
      setBccInput("");
      setSubject("");
      setContent("");
      setScheduledFor("");
      setAttachments((current) => {
        current.forEach((attachment) => {
          if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
        });
        return [];
      });
      setSelectedSignatureId(null);
      setBusyState(null);
      setErrorMessage(null);
      setStatusMessage(null);
      return;
    }

    setMailboxId(selectedMailboxId !== "all" ? selectedMailboxId : "");
  }, [open, selectedMailboxId]);

  useEffect(() => {
    if (!open) return;
    const defaultSignature = getDefaultEmailSignature(signatures, mailboxId || null);
    setSelectedSignatureId(defaultSignature?.id || null);
  }, [mailboxId, open, signatures]);

  const selectedMailbox =
    mailboxes.find((mailbox) => mailbox.id === mailboxId) || null;
  const visibleProjects = useMemo(
    () =>
      projects
        .filter((project) => !project.archived)
        .sort((left, right) => left.name.localeCompare(right.name)),
    [projects],
  );

  const buildPayload = () => ({
    mailboxId,
    projectId: projectId || null,
    subject: subject.trim(),
    contentText: richTextToPlainText(content),
    contentHtml: content,
    signatureText: selectedSignature?.content || null,
    to: parseRecipientList(toInput),
    cc: parseRecipientList(ccInput),
    bcc: parseRecipientList(bccInput),
    attachments: attachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      url: attachment.url,
      type: attachment.type,
      sizeBytes: attachment.sizeBytes,
      mimeType: attachment.mimeType,
      storageProvider: attachment.storageProvider,
      inline: attachment.inline,
    })),
  });

  const ensureDraft = async () => {
    const payload = buildPayload();
    if (!payload.mailboxId) {
      throw new Error("Choose a sender mailbox.");
    }

    const response = await fetch(
      draftId ? `/api/email/outbound-drafts/${draftId}` : "/api/email/outbound-drafts",
      {
        method: draftId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      },
    );
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Failed to save outbound draft");
    }

    setDraftId(result.id);
    return result as EmailOutboundDraft;
  };

  const handleFilesAdded = async (files: File[]) => {
    if (files.length === 0 || busyState === "upload") return;

    setBusyState("upload");
    setErrorMessage(null);

    try {
      const uploadedAttachments: ComposerAttachment[] = [];

      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/api/attachments/upload", {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || `Failed to upload ${file.name}`);
        }

        uploadedAttachments.push({
          id: payload.id,
          name: payload.name,
          url: payload.url,
          type: payload.type,
          sizeBytes: payload.size_bytes,
          mimeType: payload.mime_type,
          storageProvider: payload.storage_provider,
          inline: false,
          isImage: file.type.startsWith("image/"),
          previewUrl: file.type.startsWith("image/")
            ? URL.createObjectURL(file)
            : null,
        });
      }

      setAttachments((current) => [...current, ...uploadedAttachments]);
      setStatusMessage(
        `Uploaded ${uploadedAttachments.length} attachment${uploadedAttachments.length === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to upload files",
      );
    } finally {
      setBusyState(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleFileInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    await handleFilesAdded(Array.from(files));
  };

  const handleRemoveAttachment = (attachmentId: string) => {
    setAttachments((current) => {
      const match = current.find((attachment) => attachment.id === attachmentId);
      if (match?.previewUrl) {
        URL.revokeObjectURL(match.previewUrl);
      }
      return current.filter((attachment) => attachment.id !== attachmentId);
    });
  };

  const handleToggleInlineAttachment = (attachmentId: string) => {
    setAttachments((current) =>
      current.map((attachment) =>
        attachment.id === attachmentId
          ? { ...attachment, inline: !attachment.inline }
          : attachment,
      ),
    );
  };

  const handleSend = async () => {
    if (busyState) return;

    setBusyState("send");
    setErrorMessage(null);

    try {
      const draft = await ensureDraft();
      const response = await fetch(`/api/email/outbound-drafts/${draft.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to send email");
      }

      onOpenChange(false);
      onSent?.({
        mailboxId,
        threadId: payload.threadId || null,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to send email",
      );
    } finally {
      setBusyState(null);
    }
  };

  const handleSchedule = async () => {
    if (busyState) return;

    setBusyState("schedule");
    setErrorMessage(null);

    try {
      if (!scheduledFor) {
        throw new Error("Choose a date and time before scheduling.");
      }

      const draft = await ensureDraft();
      const response = await fetch(
        `/api/email/outbound-drafts/${draft.id}/schedule`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            scheduledFor: new Date(scheduledFor).toISOString(),
          }),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to schedule email");
      }

      onOpenChange(false);
      onScheduled?.(payload as EmailOutboundDraft);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to schedule email",
      );
    } finally {
      setBusyState(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl border-zinc-800 bg-zinc-950 text-zinc-100">
        <DialogTitle>New Email</DialogTitle>
        <DialogDescription className="text-zinc-400">
          Create a new outbound email from a connected mailbox.
        </DialogDescription>

        <div className="space-y-4">
          {errorMessage ? (
            <div className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
              {errorMessage}
            </div>
          ) : null}
          {statusMessage ? (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-300">
              {statusMessage}
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <FloatingFieldLabel label="From" />
              <Select value={mailboxId} onValueChange={setMailboxId}>
                <SelectTrigger className="border-zinc-700 bg-zinc-900 text-zinc-100">
                  <SelectValue placeholder="Choose sender mailbox" />
                </SelectTrigger>
                <SelectContent className="border-zinc-800 bg-zinc-950 text-zinc-100">
                  {mailboxes.map((mailbox) => (
                    <SelectItem key={mailbox.id} value={mailbox.id}>
                      {mailbox.name} ({mailbox.emailAddress})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <FloatingFieldLabel label="Project" />
              <Select value={projectId || "__none__"} onValueChange={(value) => setProjectId(value === "__none__" ? "" : value)}>
                <SelectTrigger className="border-zinc-700 bg-zinc-900 text-zinc-100">
                  <SelectValue placeholder="No project" />
                </SelectTrigger>
                <SelectContent className="border-zinc-800 bg-zinc-950 text-zinc-100">
                  <SelectItem value="__none__">No project</SelectItem>
                  {visibleProjects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <div className="relative pt-2">
              <FloatingFieldLabel label="To" />
              <Input
                value={toInput}
                onChange={(event) => setToInput(event.target.value)}
                placeholder="alice@example.com, Bob <bob@example.com>"
                className="border-zinc-700 bg-zinc-900 text-zinc-100"
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="relative pt-2">
                <FloatingFieldLabel label="Cc" />
                <Input
                  value={ccInput}
                  onChange={(event) => setCcInput(event.target.value)}
                  placeholder="Optional"
                  className="border-zinc-700 bg-zinc-900 text-zinc-100"
                />
              </div>
              <div className="relative pt-2">
                <FloatingFieldLabel label="Bcc" />
                <Input
                  value={bccInput}
                  onChange={(event) => setBccInput(event.target.value)}
                  placeholder="Optional"
                  className="border-zinc-700 bg-zinc-900 text-zinc-100"
                />
              </div>
            </div>
            <div className="relative pt-2">
              <FloatingFieldLabel label="Subject" />
              <Input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Subject"
                className="border-zinc-700 bg-zinc-900 text-zinc-100"
              />
            </div>
            <div className="space-y-1">
              <FloatingFieldLabel label="Signature" />
              <Select
                value={selectedSignatureId || "__none__"}
                onValueChange={(value) =>
                  setSelectedSignatureId(value === "__none__" ? null : value)
                }
              >
                <SelectTrigger className="border-zinc-700 bg-zinc-900 text-zinc-100">
                  <SelectValue placeholder="No signature" />
                </SelectTrigger>
                <SelectContent className="border-zinc-800 bg-zinc-950 text-zinc-100">
                  <SelectItem value="__none__">No signature</SelectItem>
                  {applicableSignatures.map((signature) => (
                    <SelectItem key={signature.id} value={signature.id}>
                      {signature.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60">
            <RichTextEditor
              value={content}
              onChange={setContent}
              placeholder="Write your email..."
              minHeightClassName="min-h-[280px]"
            />
            <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800 px-3 py-3">
              <Tooltip content="Add attachments" className="w-auto">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busyState === "upload"}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white disabled:opacity-50"
                >
                  {busyState === "upload" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Paperclip className="h-4 w-4" />
                  )}
                </button>
              </Tooltip>
              <div className="text-xs text-zinc-500">
                Attach files, then send now or schedule later.
              </div>
              <div className="relative ml-auto min-w-[220px] flex-1 pt-2 sm:max-w-[280px]">
                <FloatingFieldLabel label="Send Later" />
                <input
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(event) => setScheduledFor(event.target.value)}
                  className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-white"
                />
              </div>
              <button
                type="button"
                onClick={() => void handleSchedule()}
                disabled={
                  busyState === "schedule" ||
                  busyState === "upload" ||
                  !mailboxId ||
                  !hasRichTextContent(content)
                }
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white disabled:opacity-50"
              >
                {busyState === "schedule" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MailPlus className="h-4 w-4" />
                )}
                <span>Schedule</span>
              </button>
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={
                  busyState === "send" ||
                  busyState === "upload" ||
                  !mailboxId ||
                  !hasRichTextContent(content)
                }
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-theme-gradient px-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {busyState === "send" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <SendHorizontal className="h-4 w-4" />
                )}
                <span>Send</span>
              </button>
            </div>
          </div>

          {attachments.length > 0 ? (
            <div className="space-y-2">
              {attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2"
                >
                  <div className="mt-0.5 text-zinc-400">
                    {attachment.isImage ? (
                      <ImageIcon className="h-4 w-4" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-zinc-100">
                      {attachment.name}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {formatReplyAttachmentSize(attachment.sizeBytes)}
                    </div>
                    {attachment.isImage && attachment.previewUrl ? (
                      <Image
                        src={attachment.previewUrl}
                        alt={attachment.name}
                        width={160}
                        height={112}
                        unoptimized
                        className="mt-2 max-h-28 w-auto rounded-lg border border-zinc-800 object-contain"
                      />
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleInlineAttachment(attachment.id)}
                      className={`rounded-md border px-2 py-1 text-xs ${
                        attachment.inline
                          ? "border-theme-primary/50 bg-theme-primary/15 text-white"
                          : "border-zinc-700 bg-zinc-900 text-zinc-400"
                      }`}
                    >
                      Inline
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveAttachment(attachment.id)}
                      className="rounded-md border border-zinc-700 bg-zinc-900 p-1 text-zinc-400 transition-colors hover:border-zinc-600 hover:text-white"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          onChange={(event) => void handleFileInputChange(event)}
        />

        {selectedMailbox ? (
          <div className="text-xs text-zinc-500">
            Sending from {selectedMailbox.displayName || selectedMailbox.name}{" "}
            &lt;{selectedMailbox.emailAddress}&gt;
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
