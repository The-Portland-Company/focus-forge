"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  applyMailboxProviderPreset,
  createEmptyMailboxForm,
  createMailboxFormFromMailbox,
  MAILBOX_PROVIDER_PRESETS,
  type MailboxFormValues,
} from "@/lib/email-inbox/provider-presets";
import { getMailboxPasswordValidationError } from "@/lib/email-inbox/shared";
import type { Mailbox, Organization } from "@/lib/types";

type SubmitMode = "create" | "edit" | "reauth";

export interface MailboxFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, the form is prefilled for editing/re-auth of this mailbox. */
  mailbox?: Mailbox | null;
  /** "reauth" focuses on re-entering credentials; "edit"/"create" otherwise. */
  mode?: SubmitMode;
  organizations: Organization[];
  /** Called after a successful save so the caller can refresh its list. */
  onSaved: () => void;
}

/**
 * Themed dialog for connecting (POST /api/email/mailboxes), editing, or
 * re-authenticating (PATCH /api/email/mailboxes/[id]) an IMAP/Gmail/Microsoft
 * mailbox. Reuses the shared mailbox form-value helpers and presets so this
 * stays in lockstep with the Today "Email Work" connect form.
 */
export function MailboxFormDialog({
  open,
  onOpenChange,
  mailbox,
  mode = "create",
  organizations,
  onSaved,
}: MailboxFormDialogProps) {
  const [form, setForm] = useState<MailboxFormValues>(createEmptyMailboxForm());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = mode !== "create" && Boolean(mailbox);
  const isReauth = mode === "reauth";

  // Reset / prefill whenever the dialog opens or the target mailbox changes.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(
      mailbox ? createMailboxFormFromMailbox(mailbox) : createEmptyMailboxForm(),
    );
  }, [open, mailbox]);

  const preset = MAILBOX_PROVIDER_PRESETS[form.provider];
  const passwordError = useMemo(
    () => getMailboxPasswordValidationError(form.provider, form.password),
    [form.provider, form.password],
  );

  // Password is required to create or re-auth; an edit may keep the stored
  // credential by leaving the field blank.
  const passwordRequired = !isEditing || isReauth;
  const canSubmit =
    !busy &&
    Boolean(form.name) &&
    (!passwordRequired || Boolean(form.password)) &&
    !(form.password && passwordError);

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        provider: form.provider,
        name: form.name,
        displayName: form.displayName,
        emailAddress: form.emailAddress,
        loginUsername: form.loginUsername || form.emailAddress,
        password: form.password,
        imapHost: form.imapHost,
        imapPort: Number(form.imapPort) || undefined,
        smtpHost: form.smtpHost,
        smtpPort: Number(form.smtpPort) || undefined,
        syncFolder: form.syncFolder,
        isShared: form.isShared,
        organizationId:
          form.organizationId === "none" ? null : form.organizationId,
      };

      const response =
        isEditing && mailbox
          ? await fetch(`/api/email/mailboxes/${mailbox.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              // On edit, omit a blank password so we don't clobber the
              // stored credential; re-auth always sends the new one.
              body: JSON.stringify(
                form.password
                  ? payload
                  : { ...payload, password: undefined },
              ),
            })
          : await fetch("/api/email/mailboxes", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Failed to save mailbox");
      }

      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save mailbox");
    } finally {
      setBusy(false);
    }
  }

  const title = isReauth
    ? "Reconnect Mailbox"
    : isEditing
      ? "Update Mailbox"
      : "Connect Mailbox";

  const inputClass =
    "rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white";

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onOpenChange(false)}>
      <DialogContent className="max-h-[92vh] w-[min(96vw,920px)] max-w-[96vw] overflow-y-auto border-zinc-800 bg-zinc-950 text-zinc-100">
        <DialogTitle className="text-lg font-semibold text-white">
          {title}
        </DialogTitle>
        <DialogDescription className="text-sm text-zinc-500">
          {isReauth
            ? "Re-enter the mailbox credentials (App Password for Gmail/Microsoft) to reconnect."
            : isEditing
              ? "Update mailbox settings. Leave the password blank to keep the stored credential."
              : "Add a new mailbox connection for Forge to sync and process."}
        </DialogDescription>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Select
            value={form.provider}
            onValueChange={(value) =>
              setForm((prev) =>
                applyMailboxProviderPreset(
                  prev,
                  value as Mailbox["provider"],
                ),
              )
            }
          >
            <SelectTrigger className="border-zinc-700 bg-zinc-800 text-white">
              <SelectValue placeholder="Provider" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(MAILBOX_PROVIDER_PRESETS).map(
                ([provider, providerPreset]) => (
                  <SelectItem key={provider} value={provider}>
                    {providerPreset.label}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
          <input
            value={form.name}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, name: event.target.value }))
            }
            placeholder="Mailbox name"
            className={inputClass}
          />
          <input
            value={form.displayName}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, displayName: event.target.value }))
            }
            placeholder="Display name"
            className={inputClass}
          />
          <input
            value={form.emailAddress}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                emailAddress: event.target.value,
                loginUsername:
                  !prev.loginUsername ||
                  prev.loginUsername === prev.emailAddress
                    ? event.target.value
                    : prev.loginUsername,
              }))
            }
            placeholder="Mailbox email"
            className={inputClass}
          />
          <input
            value={form.loginUsername}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                loginUsername: event.target.value,
              }))
            }
            placeholder="Login username"
            className={inputClass}
          />
          <input
            value={form.password}
            type="password"
            onChange={(event) =>
              setForm((prev) => ({ ...prev, password: event.target.value }))
            }
            placeholder={
              form.provider === "gmail"
                ? "16-character Google App Password"
                : isEditing && !isReauth
                  ? "New password (leave blank to keep)"
                  : "Mailbox password"
            }
            className={`rounded-lg border bg-zinc-800 px-3 py-2 text-sm text-white ${
              form.password && passwordError
                ? "border-red-500/70"
                : "border-zinc-700"
            }`}
          />
          <input
            value={form.imapHost}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, imapHost: event.target.value }))
            }
            placeholder="IMAP host"
            className={inputClass}
          />
          <input
            value={form.imapPort}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, imapPort: event.target.value }))
            }
            placeholder="IMAP port"
            className={inputClass}
          />
          <input
            value={form.smtpHost}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, smtpHost: event.target.value }))
            }
            placeholder="SMTP host"
            className={inputClass}
          />
          <input
            value={form.smtpPort}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, smtpPort: event.target.value }))
            }
            placeholder="SMTP port"
            className={inputClass}
          />
          <input
            value={form.syncFolder}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, syncFolder: event.target.value }))
            }
            placeholder="Sync folder"
            className={inputClass}
          />
          <Select
            value={form.organizationId}
            onValueChange={(value) =>
              setForm((prev) => ({ ...prev, organizationId: value }))
            }
          >
            <SelectTrigger className="border-zinc-700 bg-zinc-800 text-white">
              <SelectValue placeholder="Organization" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Personal mailbox</SelectItem>
              {organizations.map((organization) => (
                <SelectItem key={organization.id} value={organization.id}>
                  {organization.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={form.isShared}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  isShared: event.target.checked,
                }))
              }
            />
            Shared mailbox
          </label>
        </div>
        <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/70 px-3 py-2">
          <div className="text-sm font-medium text-zinc-200">
            {preset.label}
          </div>
          <div className="mt-1 text-xs text-zinc-500">{preset.description}</div>
          {form.provider === "gmail" ? (
            <div className="mt-2 text-xs text-amber-300">
              Paste the 16-character Google App Password. Forge strips the
              display spaces automatically.
            </div>
          ) : null}
          {form.password && passwordError ? (
            <div className="mt-2 text-xs text-red-300">{passwordError}</div>
          ) : null}
          {error ? (
            <div className="mt-2 text-xs text-red-300">{error}</div>
          ) : null}
        </div>
        <div className="mt-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="rounded-lg bg-theme-gradient px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy
              ? isReauth
                ? "Reconnecting…"
                : isEditing
                  ? "Updating…"
                  : "Connecting…"
              : isReauth
                ? "Reconnect"
                : isEditing
                  ? "Update Mailbox"
                  : "Save Mailbox"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
