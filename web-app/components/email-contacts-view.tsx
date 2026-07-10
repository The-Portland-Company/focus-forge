"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Contact as ContactIcon,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/contexts/ToastContext";
import { cn } from "@/lib/utils";

type ContactSource =
  | "manual"
  | "mail"
  | "google"
  | "apple"
  | "import"
  | "org"
  | string;

interface ContactRow {
  id: string;
  email: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  source: ContactSource;
  user_id: string | null;
  organization_id: string | null;
  created_at: string;
}

type ScopeFilter = "all" | "personal" | "org";

interface ContactFormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

const EMPTY_FORM: ContactFormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
};

const PAGE_SIZE = 100;

function isPersonalContact(contact: ContactRow): boolean {
  return Boolean(contact.user_id);
}

function getContactDisplayName(contact: ContactRow): string {
  const explicit = contact.display_name?.trim();
  if (explicit) return explicit;
  const composed = [contact.first_name, contact.last_name]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return composed || contact.email;
}

function getContactInitials(contact: ContactRow): string {
  const name = getContactDisplayName(contact).trim();
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  const single = parts[0] || contact.email;
  return single.slice(0, 2).toUpperCase();
}

const SOURCE_BADGE_LABELS: Record<string, string> = {
  manual: "Manual",
  mail: "Mail",
  google: "Google",
  apple: "Apple",
  import: "Import",
  org: "Org",
};

function getSourceBadgeLabel(source: ContactSource): string {
  return SOURCE_BADGE_LABELS[source] ?? source;
}

export function EmailContactsView() {
  const { showSuccess, showError, showInfo } = useToast();

  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<ScopeFilter>("all");

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<ContactRow | null>(null);
  const [form, setForm] = useState<ContactFormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ContactRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [isImportMenuOpen, setIsImportMenuOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const importMenuRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Debounce the search input into the query that drives the fetch.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setQuery(searchInput.trim());
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  const loadContacts = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      params.set("scope", scope);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", "0");
      const response = await fetch(
        `/api/email/contacts?${params.toString()}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }
      const payload = (await response.json()) as {
        contacts: ContactRow[];
        total: number;
      };
      setContacts(Array.isArray(payload.contacts) ? payload.contacts : []);
      setTotal(typeof payload.total === "number" ? payload.total : 0);
    } catch (error) {
      console.error("Failed to load contacts", error);
      showError("Couldn't load contacts", "Please try again in a moment.");
      setContacts([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [query, scope, showError]);

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

  // Close the import menu on outside click.
  useEffect(() => {
    if (!isImportMenuOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (
        importMenuRef.current &&
        !importMenuRef.current.contains(event.target as Node)
      ) {
        setIsImportMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isImportMenuOpen]);

  const openAddForm = useCallback(() => {
    setEditingContact(null);
    setForm(EMPTY_FORM);
    setIsFormOpen(true);
  }, []);

  const openEditForm = useCallback((contact: ContactRow) => {
    setEditingContact(contact);
    setForm({
      firstName: contact.first_name ?? "",
      lastName: contact.last_name ?? "",
      email: contact.email ?? "",
      phone: contact.phone ?? "",
    });
    setIsFormOpen(true);
  }, []);

  const handleSaveContact = useCallback(async () => {
    const email = form.email.trim();
    if (!email) {
      showError("Email is required", "Enter an email address for this contact.");
      return;
    }
    setIsSaving(true);
    try {
      const body = {
        email,
        firstName: form.firstName.trim() || undefined,
        lastName: form.lastName.trim() || undefined,
        phone: form.phone.trim() || undefined,
      };
      const response = editingContact
        ? await fetch(`/api/email/contacts/${editingContact.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch(`/api/email/contacts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }
      showSuccess(
        editingContact ? "Contact updated" : "Contact added",
        email,
      );
      setIsFormOpen(false);
      setEditingContact(null);
      setForm(EMPTY_FORM);
      await loadContacts();
    } catch (error) {
      console.error("Failed to save contact", error);
      showError(
        editingContact ? "Couldn't update contact" : "Couldn't add contact",
        "Please check the details and try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }, [editingContact, form, loadContacts, showError, showSuccess]);

  const handleDeleteContact = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const response = await fetch(
        `/api/email/contacts/${deleteTarget.id}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }
      showSuccess("Contact deleted", getContactDisplayName(deleteTarget));
      setDeleteTarget(null);
      await loadContacts();
    } catch (error) {
      console.error("Failed to delete contact", error);
      showError("Couldn't delete contact", "Please try again in a moment.");
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, loadContacts, showError, showSuccess]);

  const handleFileSelected = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // Reset the input so re-selecting the same file re-triggers change.
      event.target.value = "";
      if (!file) return;
      setIsImporting(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch(`/api/email/contacts/import`, {
          method: "POST",
          body: formData,
        });
        if (!response.ok) {
          throw new Error(`Request failed (${response.status})`);
        }
        const payload = (await response.json()) as {
          result: {
            imported: number;
            updated: number;
            skipped: number;
            total: number;
          };
        };
        const { imported, updated, skipped, total: totalRows } = payload.result;
        showSuccess(
          "Import complete",
          `${imported} added, ${updated} updated, ${skipped} skipped of ${totalRows}.`,
        );
        await loadContacts();
      } catch (error) {
        console.error("Failed to import contacts", error);
        showError("Import failed", "Check the file format and try again.");
      } finally {
        setIsImporting(false);
      }
    },
    [loadContacts, showError, showSuccess],
  );

  const handleGoogleImport = useCallback(async () => {
    setIsImportMenuOpen(false);
    try {
      const response = await fetch(`/api/email/contacts/google/connect`);
      if (response.status === 501) {
        showInfo("Google import isn't configured yet");
        return;
      }
      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }
      const payload = (await response.json()) as {
        url?: string;
        configured?: boolean;
      };
      if (payload.configured === false || !payload.url) {
        showInfo("Google import isn't configured yet");
        return;
      }
      window.location.href = payload.url;
    } catch (error) {
      console.error("Failed to start Google import", error);
      showError("Couldn't start Google import", "Please try again in a moment.");
    }
  }, [showError, showInfo]);

  const scopeCountLabel = useMemo(() => {
    if (isLoading) return "Loading…";
    if (total === 0) return "No contacts";
    return `${total} contact${total === 1 ? "" : "s"}`;
  }, [isLoading, total]);

  return (
    <div className="min-w-0 space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        accept=".vcf,.csv"
        className="hidden"
        onChange={handleFileSelected}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <ContactIcon className="h-6 w-6 text-[rgb(var(--theme-primary-rgb))]" />
            <h1 className="text-2xl font-bold">Contacts</h1>
          </div>
          <p className="mt-1 text-sm text-zinc-500">{scopeCountLabel}</p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            size="sm"
            onClick={openAddForm}
            className="bg-[rgb(var(--theme-primary-rgb))] text-white hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Add contact
          </Button>

          <div className="relative" ref={importMenuRef}>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setIsImportMenuOpen((open) => !open)}
              disabled={isImporting}
              aria-haspopup="menu"
              aria-expanded={isImportMenuOpen}
            >
              {isImporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Import
            </Button>
            {isImportMenuOpen ? (
              <div
                role="menu"
                className="absolute right-0 z-50 mt-1 w-56 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsImportMenuOpen(false);
                    fileInputRef.current?.click();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-200 transition-colors hover:bg-zinc-800 hover:text-white"
                >
                  <Upload className="h-4 w-4 text-zinc-400" />
                  Upload vCard/CSV…
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void handleGoogleImport()}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-200 transition-colors hover:bg-zinc-800 hover:text-white"
                >
                  <UserPlus className="h-4 w-4 text-zinc-400" />
                  Import from Google
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search contacts by name or email…"
            className="pl-9"
            aria-label="Search contacts"
          />
        </div>
        <Select
          value={scope}
          onValueChange={(value) => setScope(value as ScopeFilter)}
        >
          <SelectTrigger
            className="h-11 w-[130px] shrink-0 border-zinc-700 bg-zinc-800/50 sm:h-10"
            aria-label="Filter by scope"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="personal">Personal</SelectItem>
            <SelectItem value="org">Org</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/40">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading contacts…
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <ContactIcon className="h-8 w-8 text-zinc-600" />
            <p className="text-sm font-medium text-zinc-300">
              {query ? "No matching contacts" : "No contacts yet"}
            </p>
            <p className="text-sm text-zinc-500">
              {query
                ? "Try a different search or scope."
                : "Add a contact or import from a vCard/CSV to get started."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-800">
            {contacts.map((contact) => {
              const personal = isPersonalContact(contact);
              const displayName = getContactDisplayName(contact);
              return (
                <li
                  key={contact.id}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-zinc-800/40"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm font-semibold text-zinc-200">
                    {getContactInitials(contact)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-white">
                        {displayName}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none",
                          contact.source === "org"
                            ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                            : "border-zinc-700 bg-zinc-800 text-zinc-400",
                        )}
                      >
                        {getSourceBadgeLabel(contact.source)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-zinc-500">
                      {displayName !== contact.email ? (
                        <span className="truncate">{contact.email}</span>
                      ) : null}
                      {contact.phone ? (
                        <span className="truncate">{contact.phone}</span>
                      ) : null}
                    </div>
                  </div>
                  {personal ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEditForm(contact)}
                        aria-label={`Edit ${displayName}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(contact)}
                        aria-label={`Delete ${displayName}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-red-950/50 hover:text-red-300"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <span className="shrink-0 text-xs text-zinc-600">
                      Read-only
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog
        open={isFormOpen}
        onOpenChange={(next) => {
          if (isSaving) return;
          setIsFormOpen(next);
          if (!next) {
            setEditingContact(null);
            setForm(EMPTY_FORM);
          }
        }}
      >
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingContact ? "Edit contact" : "Add contact"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="contact-first-name">First name</Label>
                <Input
                  id="contact-first-name"
                  value={form.firstName}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      firstName: event.target.value,
                    }))
                  }
                  placeholder="Jane"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contact-last-name">Last name</Label>
                <Input
                  id="contact-last-name"
                  value={form.lastName}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      lastName: event.target.value,
                    }))
                  }
                  placeholder="Doe"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-email">Email</Label>
              <Input
                id="contact-email"
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, email: event.target.value }))
                }
                placeholder="jane@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-phone">Phone</Label>
              <Input
                id="contact-phone"
                type="tel"
                value={form.phone}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, phone: event.target.value }))
                }
                placeholder="+1 555 123 4567"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsFormOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleSaveContact()}
              disabled={isSaving}
              className="bg-[rgb(var(--theme-primary-rgb))] text-white hover:opacity-90"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : editingContact ? (
                "Save changes"
              ) : (
                "Add contact"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => {
          if (!next) setDeleteTarget(null);
        }}
        title="Delete contact"
        description={
          deleteTarget
            ? `Remove ${getContactDisplayName(deleteTarget)} from your contacts? This can't be undone.`
            : undefined
        }
        confirmLabel="Delete"
        destructive
        isLoading={isDeleting}
        onConfirm={() => void handleDeleteContact()}
      />
    </div>
  );
}

export default EmailContactsView;
