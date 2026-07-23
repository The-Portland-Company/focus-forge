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
import { RecipientAutocompleteInput } from "@/components/ui/recipient-autocomplete-input";
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
import {
  loadDefaultMailboxId,
  loadMailboxSignatureId,
  saveDefaultMailboxId,
  saveMailboxSignatureId,
} from "@/lib/email-composer-prefs";
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

type InitialDraftAttachment = {
  /**
   * Source URL to fetch the binary from (e.g. the thread attachment streaming
   * route `/api/email/messages/{messageId}/attachments/{index}`). The composer
   * fetches this as a blob client-side and runs it through the normal upload
   * path so it becomes a real Supabase-storage draft attachment.
   */
  sourceUrl: string;
  name: string;
  mimeType?: string | null;
};

export type EmailComposerInitialDraft = {
  subject?: string;
  body?: string;
  attachments?: InitialDraftAttachment[];
};

type EmailOutboundComposerModalProps = {
  open: boolean;
  mailboxes: Mailbox[];
  projects: Project[];
  signatures: EmailSignature[];
  selectedMailboxId: string;
  userId?: string | null;
  onOpenChange: (open: boolean) => void;
  onSent?: (result: { mailboxId: string; threadId?: string | null }) => void;
  onScheduled?: (draft: EmailOutboundDraft) => void;
  initialDraft?: EmailComposerInitialDraft | null;
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
  userId,
  onOpenChange,
  onSent,
  onScheduled,
  initialDraft,
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
  // Real send/schedule progress reported along the bottom of the composer.
  // step is the 0-based index of the current/last-completed stage.
  const [sendProgress, setSendProgress] = useState<{
    label: string;
    step: number;
    total: number;
    failed?: boolean;
  } | null>(null);
  // Suppresses persisting the signature selection while we are programmatically
  // restoring the per-mailbox default (so restoring doesn't masquerade as a
  // user choice).
  const restoringSignatureRef = useRef(false);
  // While true, an initialDraft attachment is being copied in (fetch blob +
  // upload). Send/Schedule stay disabled until it lands or fails-with-notice.
  const [importingAttachment, setImportingAttachment] = useState(false);
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
      setSendProgress(null);
      setImportingAttachment(false);
      return;
    }

    // Sending-mailbox default, in priority order: the explicitly-selected
    // inbox → the user's saved default (persisted, validated against the
    // mailboxes still available) → the first available mailbox. The last leg
    // means a new email NEVER opens without a sender: with one mailbox it is
    // that mailbox, and with several the system picks one automatically (the
    // persist effect below then saves it as the default, which the user can
    // change at any time via this select).
    const explicit = selectedMailboxId !== "all" ? selectedMailboxId : "";
    let nextMailboxId = explicit;
    if (!nextMailboxId) {
      const stored = loadDefaultMailboxId(userId);
      if (stored && mailboxes.some((mailbox) => mailbox.id === stored)) {
        nextMailboxId = stored;
      }
    }
    if (!nextMailboxId && mailboxes.length > 0) {
      nextMailboxId = mailboxes[0].id;
    }
    setMailboxId(nextMailboxId);
    setSubject(initialDraft?.subject ?? "");
    setContent(initialDraft?.body ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedMailboxId]);

  // Late-arriving mailboxes: if the composer opened before the mailbox list
  // loaded, fill the default in as soon as it arrives (same priority: saved
  // default, else first mailbox). Never overrides an existing selection.
  useEffect(() => {
    if (!open || mailboxId || mailboxes.length === 0) return;
    const stored = loadDefaultMailboxId(userId);
    setMailboxId(
      stored && mailboxes.some((mailbox) => mailbox.id === stored)
        ? stored
        : mailboxes[0].id,
    );
  }, [mailboxId, mailboxes, open, userId]);

  // Persist the chosen inbox as the default for future opens (skip the empty
  // "no selection yet" state and only while the composer is open).
  useEffect(() => {
    if (!open || !mailboxId) return;
    saveDefaultMailboxId(userId, mailboxId);
  }, [mailboxId, open, userId]);

  // When the inbox changes (or the composer opens), restore the signature the
  // user last associated with this inbox; fall back to the signature library's
  // default for the mailbox. Marked as a restore so it isn't re-persisted.
  useEffect(() => {
    if (!open) return;
    const applicable = getApplicableEmailSignatures(signatures, mailboxId || null);
    const savedId = loadMailboxSignatureId(userId, mailboxId || null);
    const saved =
      savedId && applicable.some((signature) => signature.id === savedId)
        ? savedId
        : null;
    const fallback = getDefaultEmailSignature(signatures, mailboxId || null);
    restoringSignatureRef.current = true;
    setSelectedSignatureId(saved ?? fallback?.id ?? null);
  }, [mailboxId, open, signatures, userId]);

  // Persist a user-driven signature choice as the default for the current
  // inbox. Skips the programmatic restore above.
  useEffect(() => {
    if (!open || !mailboxId) return;
    if (restoringSignatureRef.current) {
      restoringSignatureRef.current = false;
      return;
    }
    saveMailboxSignatureId(userId, mailboxId, selectedSignatureId);
  }, [selectedSignatureId, open, mailboxId, userId]);

  // Import any pre-populated attachments (e.g. a forwarded thread attachment).
  // The binary lives behind the streaming download route, so we fetch it as a
  // blob, wrap it in a File, and run it through the normal upload path — turning
  // it into a real Supabase-storage draft attachment with no server duplication.
  useEffect(() => {
    if (!open) return;
    const sources = initialDraft?.attachments;
    if (!sources || sources.length === 0) return;

    let cancelled = false;
    setImportingAttachment(true);
    setErrorMessage(null);
    setStatusMessage(
      sources.length === 1
        ? `Attaching "${sources[0].name}"…`
        : `Attaching ${sources.length} files…`,
    );

    (async () => {
      try {
        const imported: ComposerAttachment[] = [];
        for (const source of sources) {
          const response = await fetch(source.sourceUrl, {
            credentials: "include",
          });
          if (!response.ok) {
            throw new Error(`Failed to fetch "${source.name}"`);
          }
          const blob = await response.blob();
          const file = new File([blob], source.name, {
            type: source.mimeType || blob.type || "application/octet-stream",
          });
          imported.push(await uploadFile(file));
        }
        if (cancelled) return;
        setAttachments((current) => [...current, ...imported]);
        setStatusMessage(
          imported.length === 1
            ? `Attached "${imported[0].name}".`
            : `Attached ${imported.length} files.`,
        );
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Failed to attach forwarded file",
        );
        setStatusMessage(null);
      } finally {
        if (!cancelled) setImportingAttachment(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Seed once per open; initialDraft identity is stable per open from caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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

  // Parse an API response, tolerating non-JSON bodies. When infrastructure
  // fails (Cloudflare 524 timeout page, gateway 502, auth redirect), the body
  // is an HTML page — response.json() then throws the cryptic
  // "Unexpected token '<', \"<!DOCTYPE\"… is not valid JSON" the user saw on
  // send. Surface a plain-language error carrying the real HTTP status
  // instead, and never let the raw parser error escape to the UI.
  const parseApiJson = async (response: Response, fallbackError: string) => {
    let payload: any = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const serverMessage =
        payload && typeof payload.error === "string" ? payload.error : null;
      throw new Error(
        serverMessage ||
          `${fallbackError} — the server didn't respond (status ${response.status}). It may be overloaded; please try again shortly.`,
      );
    }
    if (payload === null) {
      throw new Error(
        `${fallbackError} — the server returned an unreadable response. Please try again.`,
      );
    }
    return payload;
  };

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
    const result = await parseApiJson(
      response,
      "Failed to save outbound draft",
    );

    setDraftId(result.id);
    return result as EmailOutboundDraft;
  };

  // Uploads a single File through the shared attachment upload route and maps
  // the response into a ComposerAttachment. Reused by the file picker and by the
  // forward-attachment import (which fetches a blob and wraps it in a File).
  const uploadFile = async (file: File): Promise<ComposerAttachment> => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/attachments/upload", {
      method: "POST",
      body: formData,
      credentials: "include",
    });
    const payload = await parseApiJson(
      response,
      `Failed to upload ${file.name}`,
    );

    return {
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
    };
  };

  const handleFilesAdded = async (files: File[]) => {
    if (files.length === 0 || busyState === "upload") return;

    setBusyState("upload");
    setErrorMessage(null);

    try {
      const uploadedAttachments: ComposerAttachment[] = [];

      for (const file of files) {
        uploadedAttachments.push(await uploadFile(file));
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

    const total = 3;
    setBusyState("send");
    setErrorMessage(null);
    setSendProgress({ label: "Saving draft…", step: 0, total });

    try {
      const draft = await ensureDraft();
      setSendProgress({ label: "Delivering message…", step: 1, total });

      const response = await fetch(`/api/email/outbound-drafts/${draft.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const payload = await parseApiJson(response, "Failed to send email");
      void payload;

      setSendProgress({ label: "Sent", step: 3, total });
      onOpenChange(false);
      onSent?.({
        mailboxId,
        threadId: payload.threadId || null,
      });
    } catch (error) {
      setSendProgress((current) =>
        current
          ? { ...current, label: "Send failed", failed: true }
          : { label: "Send failed", step: 0, total, failed: true },
      );
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to send email",
      );
    } finally {
      setBusyState(null);
    }
  };

  const handleSchedule = async () => {
    if (busyState) return;

    const total = 2;
    setBusyState("schedule");
    setErrorMessage(null);
    setSendProgress({ label: "Saving draft…", step: 0, total });

    try {
      if (!scheduledFor) {
        throw new Error("Choose a date and time before scheduling.");
      }

      const draft = await ensureDraft();
      setSendProgress({ label: "Scheduling…", step: 1, total });
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
      const payload = await parseApiJson(response, "Failed to schedule email");
      void payload;

      setSendProgress({ label: "Scheduled", step: 2, total });
      onOpenChange(false);
      onScheduled?.(payload as EmailOutboundDraft);
    } catch (error) {
      setSendProgress((current) =>
        current
          ? { ...current, label: "Scheduling failed", failed: true }
          : { label: "Scheduling failed", step: 0, total, failed: true },
      );
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to schedule email",
      );
    } finally {
      setBusyState(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-4xl">
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
            <div className="relative pt-2">
              <FloatingFieldLabel label="Inbox" />
              <Select value={mailboxId} onValueChange={setMailboxId}>
                <SelectTrigger className="h-auto min-h-[2.5rem] border-zinc-700 bg-zinc-900 text-zinc-100">
                  <SelectValue placeholder="Choose sender inbox">
                    {selectedMailbox ? (
                      <span className="flex min-w-0 flex-col text-left">
                        <span className="truncate">{selectedMailbox.name}</span>
                        <span className="truncate text-xs text-zinc-400">
                          {selectedMailbox.emailAddress}
                        </span>
                      </span>
                    ) : null}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="border-zinc-800 bg-zinc-950 text-zinc-100">
                  {mailboxes.map((mailbox) => (
                    <SelectItem key={mailbox.id} value={mailbox.id}>
                      <span className="flex min-w-0 flex-col text-left">
                        <span className="truncate">{mailbox.name}</span>
                        <span className="truncate text-xs text-zinc-400">
                          {mailbox.emailAddress}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="relative pt-2">
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
              <RecipientAutocompleteInput
                value={toInput}
                onChange={setToInput}
                placeholder="alice@example.com, Bob <bob@example.com>"
                className="border-zinc-700 bg-zinc-900 text-zinc-100"
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="relative pt-2">
                <FloatingFieldLabel label="Cc" />
                <RecipientAutocompleteInput
                  value={ccInput}
                  onChange={setCcInput}
                  placeholder="Optional"
                  className="border-zinc-700 bg-zinc-900 text-zinc-100"
                />
              </div>
              <div className="relative pt-2">
                <FloatingFieldLabel label="Bcc" />
                <RecipientAutocompleteInput
                  value={bccInput}
                  onChange={setBccInput}
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
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60">
            <RichTextEditor
              value={content}
              onChange={setContent}
              placeholder="Write your email..."
              minHeightClassName="min-h-[240px]"
              contentClassName="resize-y overflow-auto min-h-[240px] max-h-[70vh]"
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
                  importingAttachment ||
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
                  importingAttachment ||
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

          <div className="relative pt-2">
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

          {sendProgress ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span
                  className={
                    sendProgress.failed ? "text-red-300" : "text-zinc-300"
                  }
                >
                  {sendProgress.label}
                </span>
                <span className="text-zinc-500">
                  Step {Math.min(sendProgress.step + (sendProgress.failed ? 0 : 1), sendProgress.total)} of {sendProgress.total}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    sendProgress.failed ? "bg-red-500" : "bg-theme-gradient"
                  }`}
                  style={{
                    width: `${Math.round(
                      (Math.min(sendProgress.step, sendProgress.total) /
                        sendProgress.total) *
                        100,
                    )}%`,
                  }}
                />
              </div>
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
      </DialogContent>
    </Dialog>
  );
}
