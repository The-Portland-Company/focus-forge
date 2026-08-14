"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  User,
  Edit,
  Flag,
  Check,
  Calendar,
  Clock3,
  Copy,
  RefreshCw,
  KeyRound,
  ExternalLink,
  Mail,
  Plus,
  Trash2,
  Hourglass,
} from "lucide-react";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { UserAvatar } from "@/components/user-avatar";
import { OrganizationSettingsModal } from "@/components/organization-settings-modal";
import { TodoistIntegration } from "@/components/todoist-integration";
import { Database, EmailSignature, Organization } from "@/lib/types";
import { useUserPreferences, useUserProfile } from "@/lib/supabase/hooks";
import {
  applyTheme,
  getDatabaseThemePreset,
  persistThemePreference,
  readStoredThemePreference,
} from "@/lib/theme-utils";
import { ThemePreset, DEFAULT_THEME_PRESET } from "@/lib/theme-constants";
import { DATE_FORMAT_OPTIONS, DEFAULT_DATE_FORMAT } from "@/lib/format-date";
import { useToast } from "@/contexts/ToastContext";
import { MEMOJI_OPTIONS } from "@/lib/memoji";
import { ALLOWED_API_SCOPES, type ApiKeyMeta } from "@/lib/api/keys/types";
import {
  COMPOSER_CLOSE_ACTION_OPTIONS,
  loadComposerCloseAction,
  saveComposerCloseAction,
  type ComposerCloseAction,
} from "@/lib/email-composer-prefs";
import {
  createEmptyEmailSignature,
  deleteEmailSignature,
  loadEmailSignatures,
  saveEmailSignatures,
  upsertEmailSignature,
} from "@/lib/email-signatures";
import {
  loadHideEmailSignaturesPreference,
  saveHideEmailSignaturesPreference,
} from "@/lib/email-signature-display";
import {
  clampEmailDeleteUndoSeconds,
  DEFAULT_EMAIL_DELETE_UNDO_SECONDS,
} from "@/lib/email-inbox/thread-actions";
import {
  DEFAULT_EMAIL_REPLY_SETTINGS,
  EMAIL_REPLY_CONCISENESS_OPTIONS,
  EMAIL_REPLY_PERSONALITY_OPTIONS,
  EMAIL_REPLY_TONE_OPTIONS,
  normalizeEmailReplySettings,
  type EmailReplySettings,
} from "@/lib/email-inbox/reply-settings";
import {
  DEFAULT_EMAIL_HTML_RENDER_MODE,
  EMAIL_HTML_RENDER_MODE_OPTIONS,
  normalizeEmailHtmlRenderMode,
  type EmailHtmlRenderMode,
} from "@/lib/email-html-render-mode";
import {
  DEFAULT_EMAIL_THREAD_DISPLAY_MODE,
  EMAIL_THREAD_DISPLAY_MODE_OPTIONS,
  loadEmailThreadDisplayMode,
  saveEmailThreadDisplayMode,
  type EmailThreadDisplayMode,
} from "@/lib/email-thread-display-mode";
import {
  clampEmailPanelWidthPercent,
  DEFAULT_EMAIL_PANEL_WIDTH_PERCENT,
  EMAIL_PANEL_WIDTH_PERCENT_OPTIONS,
  MAX_EMAIL_PANEL_WIDTH_PERCENT,
  MIN_EMAIL_PANEL_WIDTH_PERCENT,
} from "@/lib/email-inbox/panel-width";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { clearDockBadge } from "@/lib/dock-badge";
import {
  KNOWN_MODELS,
  defaultChainIds,
  defaultChainIdsFor,
  modelsForSurface,
  normalizeChainIds,
  type AISurface,
  type KnownModel,
} from "@/lib/ai/model-chains";
import type { LlmProviderInfo } from "@/lib/ai/provider-status";
import { MailboxFormDialog } from "@/components/mailbox-form-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatRelativeSync } from "@/lib/email-inbox/format-relative-sync";
import {
  mailboxProviderLabel,
  mailboxStatus,
} from "@/lib/email-inbox/mailbox-status";
import type { Mailbox } from "@/lib/types";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const router = useRouter();
  const { showSuccess, showError, showInfo, showWarning } = useToast();
  const [database, setDatabase] = useState<Database | null>(null);
  // Initialize with null to avoid hydration mismatch
  const [profileColor, setProfileColor] = useState<string | null>(null);
  const [profileMemoji, setProfileMemoji] = useState<string | null>(null);
  const [priorityColor, setPriorityColor] = useState<string | null>(null);
  const [themePreset, setThemePreset] =
    useState<ThemePreset>(DEFAULT_THEME_PRESET);
  const [animationsEnabled, setAnimationsEnabled] = useState<boolean | null>(
    null,
  );
  const [dockBadgeEnabled, setDockBadgeEnabled] = useState<boolean | null>(
    null,
  );
  const [dateFormat, setDateFormat] = useState<string>(DEFAULT_DATE_FORMAT);
  const [emailInboxIntroDismissed, setEmailInboxIntroDismissed] = useState<
    boolean | null
  >(null);
  const [estimatorChain, setEstimatorChain] = useState<string[]>(
    defaultChainIds(),
  );
  const [assistantChain, setAssistantChain] = useState<string[]>(
    defaultChainIds(),
  );
  // Read-only spam-classifier runtime config, surfaced from GET /api/spam/stats.
  const [spamConfig, setSpamConfig] = useState<{
    confidenceThreshold: number;
    fallbackMode: "llm" | "private";
  } | null>(null);
  // Per-ORG email/spam AI waterfall (organizations.ai_settings.email). Unlike
  // the estimator/assistant chains above, this one is scoped to an org, so the
  // block carries its own org picker.
  const [emailAiOrgId, setEmailAiOrgId] = useState<string | null>(null);
  const [emailAiEnabled, setEmailAiEnabled] = useState(true);
  const [emailAiChain, setEmailAiChain] = useState<string[]>(
    defaultChainIdsFor("email"),
  );
  const [emailAiProviders, setEmailAiProviders] = useState<
    Array<{ id: string; configured: boolean }>
  >([]);
  const [emailAiLoading, setEmailAiLoading] = useState(false);
  const [emailAiError, setEmailAiError] = useState<string | null>(null);
  // Live LLM provider status/balance (GET /api/llm-providers/status). Only
  // DeepSeek exposes a real balance; the rest report an honest probe status.
  const [llmProviders, setLlmProviders] = useState<LlmProviderInfo[]>([]);
  const [llmProvidersLoading, setLlmProvidersLoading] = useState(false);
  const [llmProvidersError, setLlmProvidersError] = useState<string | null>(
    null,
  );
  const [llmProvidersCheckedAt, setLlmProvidersCheckedAt] = useState<
    string | null
  >(null);
  const [emailDeleteUndoSeconds, setEmailDeleteUndoSeconds] = useState<number>(
    DEFAULT_EMAIL_DELETE_UNDO_SECONDS,
  );
  const [dailyCapacityMinutes, setDailyCapacityMinutes] = useState<number>(300);
  const [emailPanelDefaultWidthPct, setEmailPanelDefaultWidthPct] =
    useState<number>(DEFAULT_EMAIL_PANEL_WIDTH_PERCENT);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [personalAccessTokens, setPersonalAccessTokens] = useState<
    ApiKeyMeta[]
  >([]);
  const [personalTokensLoading, setPersonalTokensLoading] = useState(false);
  const [personalTokensError, setPersonalTokensError] = useState<string | null>(
    null,
  );
  const [personalTokenName, setPersonalTokenName] = useState("");
  const [personalTokenTab, setPersonalTokenTab] = useState<
    "active" | "expired" | "revoked"
  >("active");
  const [personalTokenExpiresAt, setPersonalTokenExpiresAt] = useState("");
  const [personalTokenScopes, setPersonalTokenScopes] = useState<string[]>([
    "read",
  ]);
  const [personalTokenCreatedSecret, setPersonalTokenCreatedSecret] = useState<
    string | null
  >(null);
  const [createdPersonalTokenName, setCreatedPersonalTokenName] = useState("");
  const [copiedPersonalTokenSecret, setCopiedPersonalTokenSecret] =
    useState(false);
  const [sectionFromUrl, setSectionFromUrl] = useState<string | null>(null);
  const [organizationFromUrl, setOrganizationFromUrl] = useState<string | null>(
    null,
  );
  const [apiSectionAutoscrollHandled, setApiSectionAutoscrollHandled] =
    useState(false);
  const [selectedOrganization, setSelectedOrganization] =
    useState<Organization | null>(null);
  const [organizationSettingsInitialTab, setOrganizationSettingsInitialTab] =
    useState<"details" | "api-keys">("details");
  const [calendarToken, setCalendarToken] = useState<string | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarCopied, setCalendarCopied] = useState(false);
  const [emailSignatures, setEmailSignatures] = useState<EmailSignature[]>([]);
  const [hideEmailSignatures, setHideEmailSignatures] = useState(true);
  const [composerCloseAction, setComposerCloseAction] =
    useState<ComposerCloseAction>("ask");
  const [editingSignatureId, setEditingSignatureId] = useState<string | null>(
    null,
  );
  const [signatureMailboxQuery, setSignatureMailboxQuery] = useState("");
  const [signatureForm, setSignatureForm] = useState({
    name: "",
    content: "",
    mailboxScope: "all" as "all" | "selected",
    mailboxIds: [] as string[],
    isDefault: false,
  });
  const { profile, loading: profileLoading, updateProfile } = useUserProfile();
  const { preferences, updatePreferences } = useUserPreferences();
  const [emailReplySettings, setEmailReplySettings] = useState<EmailReplySettings>(
    DEFAULT_EMAIL_REPLY_SETTINGS,
  );
  const [defaultEmailHtmlRenderMode, setDefaultEmailHtmlRenderMode] =
    useState<EmailHtmlRenderMode>(DEFAULT_EMAIL_HTML_RENDER_MODE);
  const [emailThreadDisplayMode, setEmailThreadDisplayMode] =
    useState<EmailThreadDisplayMode>(DEFAULT_EMAIL_THREAD_DISPLAY_MODE);
  // Email Accounts section: connect / edit / re-auth / delete connected mailboxes.
  const [mailboxDialogOpen, setMailboxDialogOpen] = useState(false);
  const [mailboxDialogMode, setMailboxDialogMode] = useState<
    "create" | "edit" | "reauth"
  >("create");
  const [activeMailbox, setActiveMailbox] = useState<Mailbox | null>(null);
  const [mailboxToDelete, setMailboxToDelete] = useState<Mailbox | null>(null);
  const [deletingMailbox, setDeletingMailbox] = useState(false);

  const openMailboxDialog = (
    mode: "create" | "edit" | "reauth",
    mailbox: Mailbox | null,
  ) => {
    setMailboxDialogMode(mode);
    setActiveMailbox(mailbox);
    setMailboxDialogOpen(true);
  };

  const handleDeleteMailbox = async () => {
    if (!mailboxToDelete) return;
    setDeletingMailbox(true);
    try {
      const response = await fetch(
        `/api/email/mailboxes/${mailboxToDelete.id}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Failed to delete mailbox");
      }
      showSuccess("Mailbox removed");
      setMailboxToDelete(null);
      await fetchData();
    } catch (err) {
      showError(
        err instanceof Error ? err.message : "Failed to delete mailbox",
      );
    } finally {
      setDeletingMailbox(false);
    }
  };
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSectionFromUrl(params.get("section"));
    setOrganizationFromUrl(params.get("organizationId"));
  }, []);

  /**
   * Probe the LLM providers. `force` bypasses the server's 60s cache — used by
   * the Refresh button so the numbers are live on demand rather than on every
   * render.
   */
  const loadLlmProviders = async (force: boolean) => {
    setLlmProvidersLoading(true);
    setLlmProvidersError(null);
    try {
      const res = await fetch(
        `/api/llm-providers/status${force ? "?refresh=1" : ""}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`status ${res.status}`);
      const payload = await res.json();
      setLlmProviders(
        Array.isArray(payload?.providers) ? payload.providers : [],
      );
      setLlmProvidersCheckedAt(payload?.checkedAt ?? null);
    } catch {
      setLlmProvidersError(
        "Could not reach the provider status endpoint. Balances and statuses below may be stale.",
      );
    } finally {
      setLlmProvidersLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    fetchCalendarToken();
    fetchPersonalAccessTokens();
    void loadLlmProviders(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/spam/stats", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (cancelled || !payload) return;
        if (
          typeof payload.confidenceThreshold === "number" &&
          (payload.fallbackMode === "llm" || payload.fallbackMode === "private")
        ) {
          setSpamConfig({
            confidenceThreshold: payload.confidenceThreshold,
            fallbackMode: payload.fallbackMode,
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Default the Email AI providers block to the org from the URL, else the first
  // org the user can see.
  useEffect(() => {
    if (emailAiOrgId) return;
    const orgs = database?.organizations;
    if (!orgs || orgs.length === 0) return;
    const fromUrl = organizationFromUrl
      ? orgs.find((org) => org.id === organizationFromUrl)
      : null;
    setEmailAiOrgId((fromUrl || orgs[0]).id);
  }, [database, organizationFromUrl, emailAiOrgId]);

  // Load the selected org's email AI settings.
  useEffect(() => {
    if (!emailAiOrgId) return;
    let cancelled = false;
    setEmailAiLoading(true);
    setEmailAiError(null);
    fetch(`/api/organizations/${emailAiOrgId}/ai-settings`, {
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(
            res.status === 403
              ? "You need to be an owner or admin of this organization."
              : "Could not load the email AI settings.",
          );
        }
        return res.json();
      })
      .then((payload) => {
        if (cancelled) return;
        setEmailAiEnabled(payload?.settings?.email?.enabled !== false);
        setEmailAiChain(normalizeChainIds(payload?.settings?.email?.chain, "email"));
        setEmailAiProviders(
          Array.isArray(payload?.providers) ? payload.providers : [],
        );
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setEmailAiError(err.message);
      })
      .finally(() => {
        if (!cancelled) setEmailAiLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [emailAiOrgId]);

  useEffect(() => {
    if (!profile?.id) return;

    const loadedSignatures = loadEmailSignatures(profile.id);
    setEmailSignatures(loadedSignatures);
    setHideEmailSignatures(loadHideEmailSignaturesPreference(profile.id));
    setComposerCloseAction(loadComposerCloseAction(profile.id));
    setComposerCloseAction(loadComposerCloseAction(profile.id));

    if (loadedSignatures[0]) {
      setEditingSignatureId(loadedSignatures[0].id);
      setSignatureForm({
        name: loadedSignatures[0].name,
        content: loadedSignatures[0].content,
        mailboxScope: loadedSignatures[0].mailboxScope,
        mailboxIds: loadedSignatures[0].mailboxIds,
        isDefault: loadedSignatures[0].isDefault,
      });
    } else {
      setEditingSignatureId(null);
      setSignatureForm({
        name: "",
        content: "",
        mailboxScope: "all",
        mailboxIds: [],
        isDefault: false,
      });
    }
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id) return;
    saveHideEmailSignaturesPreference(profile.id, hideEmailSignatures);
  }, [hideEmailSignatures, profile?.id]);

  useEffect(() => {
    setEmailReplySettings(
      normalizeEmailReplySettings(preferences?.email_reply_settings),
    );
  }, [preferences?.email_reply_settings]);

  useEffect(() => {
    setDefaultEmailHtmlRenderMode(
      normalizeEmailHtmlRenderMode(
        preferences?.default_email_html_render_mode,
      ),
    );
  }, [preferences?.default_email_html_render_mode]);

  // The thread display-mode default is stored in localStorage (no server
  // preference column fits), so hydrate it once on mount.
  useEffect(() => {
    setEmailThreadDisplayMode(loadEmailThreadDisplayMode());
  }, []);

  const isSuperOrAdmin = ["admin", "super_admin"].includes(
    String(profile?.role || ""),
  );
  const filteredSignatureMailboxes = (database?.mailboxes || []).filter(
    (mailbox) => {
      const query = signatureMailboxQuery.trim().toLowerCase();
      if (!query) return true;
      return (
        mailbox.name.toLowerCase().includes(query) ||
        mailbox.emailAddress.toLowerCase().includes(query)
      );
    },
  );

  const beginEditingSignature = (signature: EmailSignature) => {
    setEditingSignatureId(signature.id);
    setSignatureForm({
      name: signature.name,
      content: signature.content,
      mailboxScope: signature.mailboxScope,
      mailboxIds: signature.mailboxIds,
      isDefault: signature.isDefault,
    });
    setSignatureMailboxQuery("");
  };

  const resetSignatureComposer = () => {
    setEditingSignatureId(null);
    setSignatureMailboxQuery("");
    setSignatureForm({
      name: "",
      content: "",
      mailboxScope: "all",
      mailboxIds: [],
      isDefault: emailSignatures.length === 0,
    });
  };

  const persistSignatures = (nextSignatures: EmailSignature[]) => {
    setEmailSignatures(nextSignatures);
    saveEmailSignatures(profile?.id, nextSignatures);
  };

  const handleSaveSignature = () => {
    if (!profile?.id) return;
    if (!signatureForm.name.trim()) {
      showError("Missing name", "Signature name is required.");
      return;
    }
    if (!signatureForm.content.trim()) {
      showError("Missing content", "Signature content is required.");
      return;
    }
    if (
      signatureForm.mailboxScope === "selected" &&
      signatureForm.mailboxIds.length === 0
    ) {
      showError(
        "Choose mailboxes",
        "Select at least one mailbox for a mailbox-specific signature.",
      );
      return;
    }

    const existing = emailSignatures.find(
      (signature) => signature.id === editingSignatureId,
    );
    const nextSignature = createEmptyEmailSignature(profile.id, {
      id: existing?.id,
      name: signatureForm.name.trim(),
      content: signatureForm.content.trim(),
      mailboxScope: signatureForm.mailboxScope,
      mailboxIds:
        signatureForm.mailboxScope === "all" ? [] : signatureForm.mailboxIds,
      isDefault: signatureForm.isDefault || emailSignatures.length === 0,
      createdAt: existing?.createdAt,
      updatedAt: new Date().toISOString(),
    });

    const nextSignatures = upsertEmailSignature(emailSignatures, nextSignature);
    persistSignatures(nextSignatures);
    beginEditingSignature(
      nextSignatures.find((signature) => signature.id === nextSignature.id) ||
        nextSignature,
    );
    showSuccess(
      existing ? "Signature updated" : "Signature created",
      "Reply signatures have been saved.",
    );
  };

  const handleDeleteSignature = (signatureId: string) => {
    const nextSignatures = deleteEmailSignature(emailSignatures, signatureId);
    persistSignatures(nextSignatures);
    if (nextSignatures[0]) {
      beginEditingSignature(nextSignatures[0]);
    } else {
      resetSignatureComposer();
    }
  };

  const toggleSignatureMailbox = (mailboxId: string) => {
    setSignatureForm((current) => ({
      ...current,
      mailboxIds: current.mailboxIds.includes(mailboxId)
        ? current.mailboxIds.filter((id) => id !== mailboxId)
        : [...current.mailboxIds, mailboxId],
    }));
  };

  const fetchCalendarToken = async () => {
    try {
      const response = await fetch("/api/calendar/token", {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setCalendarToken(data.token);
      }
    } catch (error) {
      console.error("Error fetching calendar token:", error);
    }
  };

  const regenerateCalendarToken = async () => {
    setCalendarLoading(true);
    try {
      const response = await fetch("/api/calendar/token", {
        method: "POST",
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setCalendarToken(data.token);
        showSuccess(
          "Token regenerated",
          "Previous calendar subscriptions will stop working.",
        );
      } else {
        showError("Failed", "Could not regenerate calendar token.");
      }
    } catch (error) {
      console.error("Error regenerating calendar token:", error);
      showError("Failed", "Could not regenerate calendar token.");
    } finally {
      setCalendarLoading(false);
    }
  };

  const getCalendarFeedUrl = () => {
    if (!calendarToken) return "";
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    return `${baseUrl}/api/calendar/feed?token=${calendarToken}`;
  };

  const copyCalendarUrl = async () => {
    const url = getCalendarFeedUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCalendarCopied(true);
      setTimeout(() => setCalendarCopied(false), 2000);
    } catch {
      showError("Copy failed", "Could not copy to clipboard.");
    }
  };

  const fetchData = async () => {
    try {
      const response = await fetch("/api/database", {
        credentials: "include",
      });
      const data = await response.json();
      setDatabase(data);
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  };

  const fetchPersonalAccessTokens = async () => {
    setPersonalTokensLoading(true);
    setPersonalTokensError(null);
    try {
      const response = await fetch("/api/keys/personal-access-tokens", {
        credentials: "include",
      });
      const payload = await response.json();
      if (response.ok) {
        setPersonalAccessTokens(payload.tokens || []);
      } else {
        setPersonalTokensError(payload.error || "Unable to load API keys.");
      }
    } catch (error) {
      console.error("Error fetching personal access tokens:", error);
      setPersonalTokensError("Unable to load API keys.");
    } finally {
      setPersonalTokensLoading(false);
    }
  };

  const createPersonalAccessToken = async () => {
    if (!personalTokenName.trim()) {
      setPersonalTokensError("Token name is required.");
      return;
    }

    const expiresMs = Date.parse(personalTokenExpiresAt);
    if (Number.isNaN(expiresMs)) {
      setPersonalTokensError("Expiration datetime is required.");
      return;
    }
    if (expiresMs <= Date.now()) {
      setPersonalTokensError("Expiration must be in the future.");
      return;
    }

    try {
      setPersonalTokensError(null);
      const response = await fetch("/api/keys/personal-access-tokens", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: personalTokenName.trim(),
          scopes: personalTokenScopes,
          expiresAt: new Date(expiresMs).toISOString(),
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setPersonalTokensError(payload.error || "Failed to create API key.");
        return;
      }

      const next = payload.key as ApiKeyMeta & { secret?: string };
      const nextList = [next, ...personalAccessTokens];
      setPersonalAccessTokens(nextList);
      setPersonalTokenName("");
      setPersonalTokenExpiresAt("");
      setPersonalTokenScopes(["read"]);
      setPersonalTokenCreatedSecret(next.secret || null);
      setCreatedPersonalTokenName(next.name || personalTokenName.trim());
      setCopiedPersonalTokenSecret(false);
      await fetchPersonalAccessTokens();
      showSuccess(
        "PAT created",
        "Save the secret now. It will not be shown again.",
      );
    } catch (error) {
      console.error("Error creating personal access token:", error);
      setPersonalTokensError("Failed to create API key.");
    }
  };

  const revokePersonalAccessToken = async (id: string) => {
    try {
      const response = await fetch(`/api/keys/personal-access-tokens/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const payload = await response.json();
        showError(
          "Failed to revoke",
          payload.error || "Could not revoke API key.",
        );
        return;
      }
      setPersonalAccessTokens((prev) =>
        prev.map((token) =>
          token.id === id ? { ...token, isActive: false } : token,
        ),
      );
      showSuccess("API key revoked", "The token can no longer be used.");
    } catch (error) {
      console.error("Error revoking personal access token:", error);
      showError("Failed to revoke", "Could not revoke API key.");
    }
  };

  const togglePersonalTokenScope = (scope: string, checked: boolean) => {
    if (scope === "read") {
      return;
    }

    setPersonalTokenScopes((prev) => {
      const base = new Set(
        prev.includes("read") ? [...prev] : [...prev, "read"],
      );
      if (checked) {
        base.add(scope);
      } else {
        base.delete(scope);
      }
      return Array.from(base);
    });
  };

  const copyTokenSecret = async (secret: string) => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopiedPersonalTokenSecret(true);
      setTimeout(() => setCopiedPersonalTokenSecret(false), 2000);
    } catch {
      showError("Copy failed", "Could not copy token secret.");
    }
  };

  useEffect(() => {
    if (sectionFromUrl === "organization-api-keys" && organizationFromUrl) {
      const org = database?.organizations?.find(
        (item) => item.id === organizationFromUrl,
      );
      if (org) {
        setSelectedOrganization(org);
        setOrganizationSettingsInitialTab("api-keys");
      }
    }

    if (sectionFromUrl === "api-keys" && !apiSectionAutoscrollHandled) {
      const anchor = document.getElementById("personal-access-keys");
      anchor?.scrollIntoView({ behavior: "smooth", block: "start" });
      setApiSectionAutoscrollHandled(true);
    }

    if (sectionFromUrl === "llm-providers" && !apiSectionAutoscrollHandled) {
      const anchor = document.getElementById("llm-providers");
      anchor?.scrollIntoView({ behavior: "smooth", block: "start" });
      setApiSectionAutoscrollHandled(true);
    }
  }, [
    sectionFromUrl,
    organizationFromUrl,
    database,
    apiSectionAutoscrollHandled,
  ]);

  // Load profile settings from Supabase
  useEffect(() => {
    if (profile && !profileLoading) {
      const userColor =
        profile.profile_color ||
        "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";
      const userAnimations = profile.animations_enabled !== false;
      const userDockBadge = (profile as any).dock_badge_enabled !== false;
      const userInboxIntroDismissed =
        (profile as any).email_inbox_intro_dismissed === true;
      const userTheme = readStoredThemePreference(
        profile.theme_preset,
        profile.id,
      );
      const userMemoji = profile.profile_memoji || null;
      const userPriorityColor = (profile as any).priority_color || "#22c55e"; // Default green
      const userDeleteUndoSeconds = clampEmailDeleteUndoSeconds(
        (profile as any).email_delete_undo_seconds,
      );
      const rawCapacity = Number(
        (profile as any).daily_capacity_minutes ?? 300,
      );
      const userCapacityMinutes = Number.isFinite(rawCapacity)
        ? Math.min(1440, Math.max(30, Math.round(rawCapacity)))
        : 300;

      setProfileColor(userColor);
      setAnimationsEnabled(userAnimations);
      setDockBadgeEnabled(userDockBadge);
      setDateFormat((profile as any).date_format || DEFAULT_DATE_FORMAT);
      setEmailInboxIntroDismissed(userInboxIntroDismissed);
      const chains = (profile as any).ai_model_chains || {};
      setEstimatorChain(normalizeChainIds(chains.estimator));
      setAssistantChain(normalizeChainIds(chains.assistant));
      setThemePreset(userTheme);
      setProfileMemoji(userMemoji);
      setPriorityColor(userPriorityColor);
      setEmailDeleteUndoSeconds(userDeleteUndoSeconds);
      setDailyCapacityMinutes(userCapacityMinutes);
      setEmailPanelDefaultWidthPct(
        clampEmailPanelWidthPercent(
          (profile as any).email_panel_default_width_pct,
        ),
      );

      // Apply complete theme immediately when profile loads
      applyTheme(userTheme, userColor, userAnimations);
    }
  }, [profile, profileLoading]);

  const handleAutoSave = async (updates: {
    profileColor?: string;
    profileMemoji?: string | null;
    priorityColor?: string;
    animationsEnabled?: boolean;
    dockBadgeEnabled?: boolean;
    dateFormat?: string;
    emailInboxIntroDismissed?: boolean;
    emailDeleteUndoSeconds?: number;
    dailyCapacityMinutes?: number;
    emailPanelDefaultWidthPct?: number;
    themePreset?: ThemePreset;
    emailReplySettings?: EmailReplySettings;
    defaultEmailHtmlRenderMode?: EmailHtmlRenderMode;
  }) => {
    setSaveStatus("saving");
    try {
      // Apply theme immediately for instant feedback
      const currentTheme = updates.themePreset ?? themePreset;
      const currentColor = updates.profileColor ?? profileColor;
      const currentAnimations =
        updates.animationsEnabled ?? animationsEnabled ?? true;
      const prefersDark =
        typeof window !== "undefined" && typeof window.matchMedia === "function"
          ? window.matchMedia("(prefers-color-scheme: dark)").matches
          : false;

      applyTheme(currentTheme, currentColor || undefined, currentAnimations);
      persistThemePreference(currentTheme, profile?.id);

      if (updateProfile) {
        // Update profile in Supabase
        const profileUpdates: any = {};
        if (updates.profileColor !== undefined) {
          profileUpdates.profile_color = updates.profileColor;
        }
        if (updates.profileMemoji !== undefined) {
          profileUpdates.profile_memoji = updates.profileMemoji;
        }
        if (updates.priorityColor !== undefined) {
          profileUpdates.priority_color = updates.priorityColor;
        }
        if (updates.animationsEnabled !== undefined) {
          profileUpdates.animations_enabled = updates.animationsEnabled;
        }
        if (updates.dockBadgeEnabled !== undefined) {
          profileUpdates.dock_badge_enabled = updates.dockBadgeEnabled;
        }
        if (updates.dateFormat !== undefined) {
          profileUpdates.date_format = updates.dateFormat;
        }
        if (updates.emailInboxIntroDismissed !== undefined) {
          profileUpdates.email_inbox_intro_dismissed =
            updates.emailInboxIntroDismissed;
        }
        if (updates.emailDeleteUndoSeconds !== undefined) {
          profileUpdates.email_delete_undo_seconds =
            clampEmailDeleteUndoSeconds(updates.emailDeleteUndoSeconds);
        }
        if (updates.dailyCapacityMinutes !== undefined) {
          const raw = Number(updates.dailyCapacityMinutes);
          const clamped = Number.isFinite(raw)
            ? Math.min(1440, Math.max(30, Math.round(raw)))
            : 300;
          profileUpdates.daily_capacity_minutes = clamped;
        }
        if (updates.emailPanelDefaultWidthPct !== undefined) {
          profileUpdates.email_panel_default_width_pct =
            clampEmailPanelWidthPercent(updates.emailPanelDefaultWidthPct);
        }
        if (updates.themePreset !== undefined) {
          profileUpdates.theme_preset = getDatabaseThemePreset(
            updates.themePreset,
            prefersDark,
          );
        }

        if (Object.keys(profileUpdates).length > 0) {
          const result = await updateProfile(profileUpdates);
          const error = result?.error;

          if (error) {
            setSaveStatus("error");
            setTimeout(() => setSaveStatus("idle"), 3000);
            return;
          }
        }
      }

      if (
        updates.emailReplySettings !== undefined ||
        updates.defaultEmailHtmlRenderMode !== undefined
      ) {
        const preferenceUpdates: Record<string, unknown> = {};
        if (updates.emailReplySettings !== undefined) {
          preferenceUpdates.email_reply_settings = updates.emailReplySettings;
        }
        if (updates.defaultEmailHtmlRenderMode !== undefined) {
          preferenceUpdates.default_email_html_render_mode =
            updates.defaultEmailHtmlRenderMode;
        }

        const result = await updatePreferences?.(preferenceUpdates);
        if (result?.error) {
          setSaveStatus("error");
          setTimeout(() => setSaveStatus("idle"), 3000);
          return;
        }
      }

      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (error) {
      console.error("Error saving settings:", error);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

  // Persist the two independent AI model chains. `surface` selects which chain
  // is being edited so the estimator and assistant never clobber each other.
  const saveModelChains = async (
    surface: AISurface,
    nextChain: string[],
  ) => {
    const estimator =
      surface === "estimator" ? nextChain : estimatorChain;
    const assistant =
      surface === "assistant" ? nextChain : assistantChain;
    setSaveStatus("saving");
    try {
      if (updateProfile) {
        const result = await updateProfile({
          ai_model_chains: { estimator, assistant },
        });
        if (result?.error) {
          setSaveStatus("error");
          setTimeout(() => setSaveStatus("idle"), 3000);
          return;
        }
      }
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

  // Set position `index` of a surface's chain to `modelId`, swapping whatever
  // model currently occupies the target slot so every position stays unique.
  const setChainPosition = (
    surface: AISurface,
    index: number,
    modelId: string,
  ) => {
    const current = surface === "estimator" ? estimatorChain : assistantChain;
    const next = [...current];
    const existingIndex = next.indexOf(modelId);
    if (existingIndex !== -1 && existingIndex !== index) {
      // Swap so no model appears twice.
      next[existingIndex] = next[index];
    }
    next[index] = modelId;
    const normalized = normalizeChainIds(next);
    if (surface === "estimator") setEstimatorChain(normalized);
    else setAssistantChain(normalized);
    void saveModelChains(surface, normalized);
  };

  // Persist the selected org's email waterfall (organizations.ai_settings.email).
  const saveEmailAiSettings = async (next: {
    enabled: boolean;
    chain: string[];
  }) => {
    if (!emailAiOrgId) return;
    setSaveStatus("saving");
    try {
      const res = await fetch(
        `/api/organizations/${emailAiOrgId}/ai-settings`,
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: next }),
        },
      );
      if (!res.ok) throw new Error("save failed");
      const payload = await res.json();
      setEmailAiEnabled(payload?.settings?.email?.enabled !== false);
      setEmailAiChain(normalizeChainIds(payload?.settings?.email?.chain, "email"));
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

  // Same swap-so-positions-stay-unique rule as setChainPosition, against the
  // org-scoped email chain.
  const setEmailChainPosition = (index: number, modelId: string) => {
    const next = [...emailAiChain];
    const existingIndex = next.indexOf(modelId);
    if (existingIndex !== -1 && existingIndex !== index) {
      next[existingIndex] = next[index];
    }
    next[index] = modelId;
    const normalized = normalizeChainIds(next, "email");
    setEmailAiChain(normalized);
    void saveEmailAiSettings({ enabled: emailAiEnabled, chain: normalized });
  };

  const renderChainEditor = (
    surface: AISurface,
    chain: string[],
    title: string,
    description: string,
    options?: {
      /** Selectable models (defaults to every known model). */
      models?: KnownModel[];
      /** How many ordered positions to render. */
      positions?: number;
      /** Override the persist handler (the email surface saves per-org). */
      onSelect?: (index: number, modelId: string) => void;
      disabled?: boolean;
      /** Optional per-model "key present on this deployment?" badges. */
      configuredById?: Record<string, boolean>;
      /** Extra content rendered under the selects. */
      children?: React.ReactNode;
    },
  ) => {
    const models = options?.models ?? KNOWN_MODELS;
    const positions = options?.positions ?? 4;
    const onSelect =
      options?.onSelect ??
      ((index: number, modelId: string) =>
        setChainPosition(surface, index, modelId));
    return (
      <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
        <h3 className="text-lg font-medium mb-1">{title}</h3>
        <p className="text-sm text-zinc-400 mb-4">{description}</p>
        <div className="space-y-3">
          {Array.from({ length: positions }, (_, position) => (
            <div key={position} className="flex items-center gap-3">
              <label
                className="w-28 text-sm text-zinc-300"
                htmlFor={`${surface}-model-${position}`}
              >
                {position === 0 ? "1st (default)" : `${position + 1}th fallback`}
              </label>
              <select
                id={`${surface}-model-${position}`}
                value={chain[position] ?? ""}
                disabled={options?.disabled}
                onChange={(e) => onSelect(position, e.target.value)}
                className="flex-1 rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-white focus:ring-2 focus:ring-theme-primary disabled:opacity-50"
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              {options?.configuredById &&
              chain[position] &&
              !options.configuredById[chain[position]] ? (
                <span className="shrink-0 rounded-md border border-amber-900/60 bg-amber-950/40 px-2 py-1 text-xs text-amber-400">
                  No API key
                </span>
              ) : null}
            </div>
          ))}
        </div>
        {options?.children}
      </div>
    );
  };

  // Theme application is now handled by the shared utility

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto w-full max-w-6xl p-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h1 className="text-2xl font-bold">Settings</h1>
          </div>
          {saveStatus !== "idle" && (
            <div
              className={`text-sm transition-opacity ${
                saveStatus === "saving"
                  ? "text-zinc-400"
                  : saveStatus === "saved"
                    ? "text-green-400"
                    : "text-red-400"
              }`}
            >
              {saveStatus === "saving" && "Saving..."}
              {saveStatus === "saved" && "✓ Saved"}
              {saveStatus === "error" && "Error saving"}
            </div>
          )}
        </div>

        <div className="space-y-12">
          {/* Your Profile Section */}
          <div>
            <h2 className="text-xl font-semibold mb-6">Your Profile</h2>
            <div className="space-y-6">
              {/* Profile Photo */}
              <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
                <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Profile Photo
                </h3>
                <p className="text-sm text-zinc-400 mb-6">
                  Pick a Memoji for your avatar. It shows across the app
                  anywhere your name appears.
                </p>
                <div className="flex items-start gap-6">
                  <div className="flex flex-col items-center gap-3">
                    <UserAvatar
                      name={
                        `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() ||
                        profile?.email ||
                        "User"
                      }
                      profileColor={profileColor}
                      memoji={profileMemoji}
                      size={112}
                      className="text-lg"
                    />
                    <div className="text-xs text-zinc-400">Current</div>
                  </div>
                  <div className="flex-1">
                    <div className="grid grid-cols-3 gap-3">
                      <button
                        type="button"
                        onClick={async () => {
                          setProfileMemoji(null);
                          await handleAutoSave({ profileMemoji: null });
                        }}
                        className={`rounded-lg border p-3 transition-colors ${!profileMemoji ? "border-theme-primary bg-zinc-800" : "border-zinc-800 hover:border-zinc-700"}`}
                      >
                        <div className="flex flex-col items-center gap-2">
                          <UserAvatar
                            name={
                              `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() ||
                              profile?.email ||
                              "User"
                            }
                            profileColor={profileColor}
                            memoji={null}
                            size={68}
                            className="text-sm"
                          />
                          <span className="text-xs text-zinc-400">
                            Initials
                          </span>
                        </div>
                      </button>
                      {MEMOJI_OPTIONS.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={async () => {
                            setProfileMemoji(option.id);
                            await handleAutoSave({ profileMemoji: option.id });
                          }}
                          className={`rounded-lg border p-3 transition-colors ${profileMemoji === option.id ? "border-theme-primary bg-zinc-800" : "border-zinc-800 hover:border-zinc-700"}`}
                        >
                          <div className="flex flex-col items-center gap-2">
                            <UserAvatar
                              name={option.label}
                              profileColor={profileColor}
                              memoji={option.id}
                              size={68}
                              className="text-sm"
                              showFallback={false}
                              ariaLabel={`${option.label} memoji`}
                            />
                            <span className="text-xs text-zinc-400">
                              {option.label}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
                <div className="mb-6">
                  <h3 className="text-lg font-medium mb-2 flex items-center gap-2">
                    <Edit className="w-5 h-5" />
                    Email Composer
                  </h3>
                  <p className="text-sm text-zinc-400">
                    What happens when you close a new email that hasn&apos;t been
                    sent — via the X, Escape, or clicking outside the window.
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {COMPOSER_CLOSE_ACTION_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setComposerCloseAction(option.value);
                          saveComposerCloseAction(profile?.id, option.value);
                        }}
                        className={cn(
                          "rounded-full border px-3 py-2 text-sm transition-colors",
                          composerCloseAction === option.value
                            ? "border-theme-primary bg-zinc-800 text-white"
                            : "border-zinc-700 bg-zinc-950/40 text-zinc-300 hover:border-zinc-500",
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-zinc-500">
                    {
                      COMPOSER_CLOSE_ACTION_OPTIONS.find(
                        (option) => option.value === composerCloseAction,
                      )?.description
                    }
                  </p>
                </div>
              </div>

              <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-medium mb-2 flex items-center gap-2">
                      <Edit className="w-5 h-5" />
                      AI Reply Style
                    </h3>
                    <p className="text-sm text-zinc-400">
                      Set your default reply voice. These defaults are used for AI
                      email replies and can be overridden on a single draft before
                      generation.
                    </p>
                  </div>
                </div>
                <div className="grid gap-6 lg:grid-cols-3">
                  <div className="space-y-3">
                    <div className="text-sm font-medium text-white">
                      Conciseness
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {EMAIL_REPLY_CONCISENESS_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={async () => {
                            const next = {
                              ...emailReplySettings,
                              conciseness: option.value,
                            };
                            setEmailReplySettings(next);
                            await handleAutoSave({ emailReplySettings: next });
                          }}
                          className={cn(
                            "rounded-full border px-3 py-2 text-sm transition-colors",
                            emailReplySettings.conciseness === option.value
                              ? "border-theme-primary bg-zinc-800 text-white"
                              : "border-zinc-700 bg-zinc-950/40 text-zinc-300 hover:border-zinc-500",
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-zinc-500">
                      {
                        EMAIL_REPLY_CONCISENESS_OPTIONS.find(
                          (option) =>
                            option.value === emailReplySettings.conciseness,
                        )?.description
                      }
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div className="text-sm font-medium text-white">Tone</div>
                    <div className="flex flex-wrap gap-2">
                      {EMAIL_REPLY_TONE_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={async () => {
                            const next = {
                              ...emailReplySettings,
                              tone: option.value,
                            };
                            setEmailReplySettings(next);
                            await handleAutoSave({ emailReplySettings: next });
                          }}
                          className={cn(
                            "rounded-full border px-3 py-2 text-sm transition-colors",
                            emailReplySettings.tone === option.value
                              ? "border-theme-primary bg-zinc-800 text-white"
                              : "border-zinc-700 bg-zinc-950/40 text-zinc-300 hover:border-zinc-500",
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="text-sm font-medium text-white">
                      Personality
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {EMAIL_REPLY_PERSONALITY_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={async () => {
                            const next = {
                              ...emailReplySettings,
                              personality: option.value,
                            };
                            setEmailReplySettings(next);
                            await handleAutoSave({ emailReplySettings: next });
                          }}
                          className={cn(
                            "rounded-full border px-3 py-2 text-sm transition-colors",
                            emailReplySettings.personality === option.value
                              ? "border-theme-primary bg-zinc-800 text-white"
                              : "border-zinc-700 bg-zinc-950/40 text-zinc-300 hover:border-zinc-500",
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-medium mb-2 flex items-center gap-2">
                      <Mail className="w-5 h-5" />
                      Email HTML Rendering
                    </h3>
                    <p className="text-sm text-zinc-400">
                      Choose how inbound HTML emails render by default in thread
                      detail. You can still switch modes while viewing a message.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  {EMAIL_HTML_RENDER_MODE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={async () => {
                        setDefaultEmailHtmlRenderMode(option.value);
                        await handleAutoSave({
                          defaultEmailHtmlRenderMode: option.value,
                        });
                      }}
                      className={cn(
                        "rounded-xl border px-4 py-3 text-left transition-colors",
                        defaultEmailHtmlRenderMode === option.value
                          ? "border-theme-primary bg-zinc-800 text-white"
                          : "border-zinc-700 bg-zinc-950/40 text-zinc-300 hover:border-zinc-500",
                      )}
                    >
                      <div className="text-sm font-medium">{option.label}</div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {option.description}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-medium mb-2 flex items-center gap-2">
                      <Mail className="w-5 h-5" />
                      Email Thread Display
                    </h3>
                    <p className="text-sm text-zinc-400">
                      Choose how an email thread opens by default when you click
                      it. You can still switch modes from the thread header while
                      reading.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  {EMAIL_THREAD_DISPLAY_MODE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setEmailThreadDisplayMode(option.value);
                        saveEmailThreadDisplayMode(option.value);
                      }}
                      className={cn(
                        "rounded-xl border px-4 py-3 text-left transition-colors",
                        emailThreadDisplayMode === option.value
                          ? "border-theme-primary bg-zinc-800 text-white"
                          : "border-zinc-700 bg-zinc-950/40 text-zinc-300 hover:border-zinc-500",
                      )}
                    >
                      <div className="text-sm font-medium">{option.label}</div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {option.description}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-medium mb-2 flex items-center gap-2">
                      <Mail className="w-5 h-5" />
                      Email Signatures
                    </h3>
                    <p className="text-sm text-zinc-400">
                      Create multiple signatures, choose a default, and limit
                      each signature to one, some, or all connected mailboxes.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={resetSignatureComposer}
                    className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white"
                  >
                    <Plus className="h-4 w-4" />
                    New Signature
                  </button>
                </div>
                <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
                  <label className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium text-white">
                        Hide Inbound Email Signatures
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        Default on. Email signatures stay collapsed behind a
                        hover-to-reveal accordion in thread detail and
                        conversation items.
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={hideEmailSignatures}
                      onClick={() =>
                        setHideEmailSignatures((current) => !current)
                      }
                      className={cn(
                        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
                        hideEmailSignatures
                          ? "bg-[rgb(var(--theme-primary-rgb))]"
                          : "bg-zinc-700",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-block h-5 w-5 transform rounded-full bg-white transition-transform",
                          hideEmailSignatures
                            ? "translate-x-5"
                            : "translate-x-1",
                        )}
                      />
                    </button>
                  </label>
                </div>
                <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
                  <div className="space-y-3">
                    {emailSignatures.length > 0 ? (
                      emailSignatures.map((signature) => (
                        <button
                          key={signature.id}
                          type="button"
                          onClick={() => beginEditingSignature(signature)}
                          className={`w-full rounded-lg border p-3 text-left transition-colors ${
                            editingSignatureId === signature.id
                              ? "border-theme-primary bg-zinc-800"
                              : "border-zinc-800 bg-zinc-950/40 hover:border-zinc-700"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-white">
                                {signature.name}
                              </div>
                              <div className="mt-1 truncate text-xs text-zinc-500">
                                {signature.mailboxScope === "all"
                                  ? "All mailboxes"
                                  : `${signature.mailboxIds.length} mailbox${signature.mailboxIds.length === 1 ? "" : "es"}`}
                              </div>
                            </div>
                            {signature.isDefault ? (
                              <span className="rounded-full border border-[rgb(var(--theme-primary-rgb))]/40 bg-[rgb(var(--theme-primary-rgb))]/12 px-2 py-0.5 text-xs sm:text-[10px] uppercase tracking-wide text-[rgb(var(--theme-primary-rgb))]">
                                Default
                              </span>
                            ) : null}
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-950/40 px-4 py-6 text-sm text-zinc-500">
                        No signatures yet.
                      </div>
                    )}
                  </div>
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-zinc-200">
                          Signature Name
                        </span>
                        <input
                          type="text"
                          value={signatureForm.name}
                          onChange={(event) =>
                            setSignatureForm((current) => ({
                              ...current,
                              name: event.target.value,
                            }))
                          }
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white transition-colors placeholder:text-zinc-500 focus:outline-none focus:ring-2 ring-theme"
                          placeholder="Customer-facing"
                        />
                      </label>
                      <label className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-3">
                        <input
                          type="checkbox"
                          checked={signatureForm.isDefault}
                          onChange={(event) =>
                            setSignatureForm((current) => ({
                              ...current,
                              isDefault: event.target.checked,
                            }))
                          }
                          className="h-5 w-5 rounded border-zinc-600 bg-zinc-800 text-theme-primary focus:ring-theme"
                        />
                        <div>
                          <div className="text-sm font-medium text-white">
                            Default Signature
                          </div>
                          <div className="text-xs text-zinc-500">
                            Used automatically in the reply composer.
                          </div>
                        </div>
                      </label>
                    </div>

                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-zinc-200">
                        Signature Content
                      </span>
                      <textarea
                        value={signatureForm.content}
                        onChange={(event) =>
                          setSignatureForm((current) => ({
                            ...current,
                            content: event.target.value,
                          }))
                        }
                        rows={6}
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white transition-colors placeholder:text-zinc-500 focus:outline-none focus:ring-2 ring-theme"
                        placeholder={
                          "Best,\nSpencer Hill\nThe Portland Company"
                        }
                      />
                    </label>

                    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
                      <div className="mb-3 text-sm font-medium text-white">
                        Mailbox Availability
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setSignatureForm((current) => ({
                              ...current,
                              mailboxScope: "all",
                              mailboxIds: [],
                            }))
                          }
                          className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                            signatureForm.mailboxScope === "all"
                              ? "border border-[rgb(var(--theme-primary-rgb))]/40 bg-[rgb(var(--theme-primary-rgb))]/12 text-[rgb(var(--theme-primary-rgb))]"
                              : "border border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-white"
                          }`}
                        >
                          All Mailboxes
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setSignatureForm((current) => ({
                              ...current,
                              mailboxScope: "selected",
                            }))
                          }
                          className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                            signatureForm.mailboxScope === "selected"
                              ? "border border-[rgb(var(--theme-primary-rgb))]/40 bg-[rgb(var(--theme-primary-rgb))]/12 text-[rgb(var(--theme-primary-rgb))]"
                              : "border border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-white"
                          }`}
                        >
                          Specific Mailboxes
                        </button>
                      </div>

                      {signatureForm.mailboxScope === "selected" ? (
                        <div className="mt-4 space-y-3">
                          <input
                            type="text"
                            value={signatureMailboxQuery}
                            onChange={(event) =>
                              setSignatureMailboxQuery(event.target.value)
                            }
                            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white transition-colors placeholder:text-zinc-500 focus:outline-none focus:ring-2 ring-theme"
                            placeholder="Type to search mailboxes..."
                          />
                          <div className="flex flex-wrap gap-2">
                            {signatureForm.mailboxIds.map((mailboxId) => {
                              const mailbox = database?.mailboxes.find(
                                (entry) => entry.id === mailboxId,
                              );
                              if (!mailbox) return null;
                              return (
                                <button
                                  key={mailboxId}
                                  type="button"
                                  onClick={() =>
                                    toggleSignatureMailbox(mailboxId)
                                  }
                                  className="rounded-full border border-[rgb(var(--theme-primary-rgb))]/40 bg-[rgb(var(--theme-primary-rgb))]/12 px-3 py-1 text-xs text-[rgb(var(--theme-primary-rgb))]"
                                >
                                  {mailbox.name}
                                </button>
                              );
                            })}
                          </div>
                          <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/60 p-2">
                            {filteredSignatureMailboxes.map((mailbox) => {
                              const isSelected =
                                signatureForm.mailboxIds.includes(mailbox.id);
                              return (
                                <button
                                  key={mailbox.id}
                                  type="button"
                                  onClick={() =>
                                    toggleSignatureMailbox(mailbox.id)
                                  }
                                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                                    isSelected
                                      ? "bg-[rgb(var(--theme-primary-rgb))]/12 text-white"
                                      : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <div className="truncate">
                                      {mailbox.name}
                                    </div>
                                    <div className="truncate text-xs text-zinc-500">
                                      {mailbox.emailAddress}
                                    </div>
                                  </div>
                                  {isSelected ? (
                                    <Check className="h-4 w-4 text-[rgb(var(--theme-primary-rgb))]" />
                                  ) : null}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs text-zinc-500">
                        Reply composer will default to this signature when it
                        matches the current mailbox.
                      </div>
                      <div className="flex items-center gap-2">
                        {editingSignatureId ? (
                          <button
                            type="button"
                            onClick={() =>
                              handleDeleteSignature(editingSignatureId)
                            }
                            className="inline-flex items-center gap-2 rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-200 transition-colors hover:bg-red-950/50"
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={handleSaveSignature}
                          className="inline-flex items-center gap-2 rounded-lg bg-theme-gradient px-4 py-2 text-sm font-medium text-white"
                        >
                          <Check className="h-4 w-4" />
                          Save Signature
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {/* Theme Settings */}
              <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
                <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Theme & Appearance
                </h3>
                <p className="text-sm text-zinc-400 mb-6">
                  Choose your theme style and customize colors. Your selection
                  affects the entire application appearance.
                </p>
                <ThemeSwitcher
                  currentTheme={themePreset}
                  currentColor={profileColor || undefined}
                  onThemeChange={async (theme) => {
                    setThemePreset(theme);
                    await handleAutoSave({ themePreset: theme });
                  }}
                  onColorChange={async (color) => {
                    setProfileColor(color);
                    await handleAutoSave({ profileColor: color });
                  }}
                />
              </div>

              {/* Animations */}
              <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
                <h3 className="text-lg font-medium mb-4">Animations</h3>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={animationsEnabled ?? true}
                    onChange={async (e) => {
                      const enabled = e.target.checked;
                      setAnimationsEnabled(enabled);
                      await handleAutoSave({ animationsEnabled: enabled });
                    }}
                    className="w-5 h-5 rounded border-zinc-600 bg-zinc-800 text-theme-primary focus:ring-2 focus:ring-theme-primary focus:ring-offset-0 focus:ring-offset-zinc-900"
                  />
                  <div>
                    <p className="text-white">Enable animations</p>
                    <p className="text-sm text-zinc-400">
                      Includes swirling gradients and other visual effects
                    </p>
                  </div>
                </label>
              </div>

              {/* Date format */}
              <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
                <h3 className="text-lg font-medium mb-4">Date format</h3>
                <p className="text-sm text-zinc-400 mb-4">
                  How dates are displayed throughout the application.
                </p>
                <select
                  value={dateFormat}
                  onChange={async (e) => {
                    const next = e.target.value;
                    setDateFormat(next);
                    await handleAutoSave({ dateFormat: next });
                  }}
                  className="w-full max-w-sm rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-theme-primary"
                >
                  {DATE_FORMAT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Dock badge */}
              <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
                <h3 className="text-lg font-medium mb-4">Dock badge</h3>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dockBadgeEnabled ?? true}
                    onChange={async (e) => {
                      const enabled = e.target.checked;
                      setDockBadgeEnabled(enabled);
                      if (!enabled) {
                        clearDockBadge();
                      }
                      await handleAutoSave({ dockBadgeEnabled: enabled });
                    }}
                    className="w-5 h-5 rounded border-zinc-600 bg-zinc-800 text-theme-primary focus:ring-2 focus:ring-theme-primary focus:ring-offset-0 focus:ring-offset-zinc-900"
                  />
                  <div>
                    <p className="text-white">Show Dock badge</p>
                    <p className="text-sm text-zinc-400">
                      Show unread/badge count on the app icon
                    </p>
                  </div>
                </label>
              </div>

              {/* Email inbox intro banner */}
              <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
                <h3 className="text-lg font-medium mb-4">Email inbox</h3>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!(emailInboxIntroDismissed ?? false)}
                    onChange={async (e) => {
                      const show = e.target.checked;
                      setEmailInboxIntroDismissed(!show);
                      await handleAutoSave({
                        emailInboxIntroDismissed: !show,
                      });
                    }}
                    className="w-5 h-5 rounded border-zinc-600 bg-zinc-800 text-theme-primary focus:ring-2 focus:ring-theme-primary focus:ring-offset-0 focus:ring-offset-zinc-900"
                  />
                  <div>
                    <p className="text-white">Show inbox intro banner</p>
                    <p className="text-sm text-zinc-400">
                      Show the green banner at the top of the Email Inbox
                    </p>
                  </div>
                </label>
              </div>

              {/* LLM providers: live status/balance, then the per-surface
                  waterfalls that decide which provider is actually used. */}
              <div id="llm-providers" className="space-y-4 scroll-mt-8">
                <div>
                  <h2 className="text-lg font-medium">LLM Providers</h2>
                  <p className="text-sm text-zinc-400">
                    The AI providers this deployment can call, their live
                    status, and — where the provider actually publishes one —
                    the remaining credit. Below the table you choose the order
                    they are tried in.
                  </p>
                </div>

                <div className="bg-zinc-900 rounded-lg border border-zinc-800">
                  <div className="flex flex-wrap items-center justify-between gap-3 p-6 pb-4">
                    <div>
                      <h3 className="text-lg font-medium">Providers in use</h3>
                      <p className="text-sm text-zinc-400">
                        {llmProvidersCheckedAt
                          ? `Checked ${new Date(llmProvidersCheckedAt).toLocaleTimeString()}. Cached for 60 seconds.`
                          : "Status is probed live against each provider."}
                      </p>
                    </div>
                    <button
                      onClick={() => void loadLlmProviders(true)}
                      disabled={llmProvidersLoading}
                      className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${llmProvidersLoading ? "animate-spin" : ""}`}
                      />
                      {llmProvidersLoading ? "Checking..." : "Refresh"}
                    </button>
                  </div>

                  {llmProvidersError ? (
                    <p className="px-6 pb-4 text-sm text-red-400">
                      {llmProvidersError}
                    </p>
                  ) : null}

                  <div className="overflow-x-auto px-6 pb-6">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
                          <th className="py-2 pr-4 font-medium">Provider</th>
                          <th className="py-2 pr-4 font-medium">Models</th>
                          <th className="py-2 pr-4 font-medium">Status</th>
                          <th className="py-2 pr-4 font-medium">Balance</th>
                          <th className="py-2 font-medium">API key</th>
                        </tr>
                      </thead>
                      <tbody>
                        {llmProviders.length === 0 ? (
                          <tr>
                            <td
                              colSpan={5}
                              className="py-4 text-sm text-zinc-500"
                            >
                              {llmProvidersLoading
                                ? "Probing providers..."
                                : "No provider status available."}
                            </td>
                          </tr>
                        ) : (
                          llmProviders.map((provider) => (
                            <tr
                              key={provider.id}
                              className="border-b border-zinc-800/60 align-top last:border-0"
                            >
                              <td className="py-3 pr-4">
                                <span className="text-white">
                                  {provider.label}
                                </span>
                                {provider.statusNote ? (
                                  <p className="mt-1 max-w-xs text-xs text-zinc-500">
                                    {provider.statusNote}
                                  </p>
                                ) : null}
                              </td>
                              <td className="py-3 pr-4 text-xs text-zinc-400">
                                {provider.models.join(", ")}
                              </td>
                              <td className="py-3 pr-4">
                                <span
                                  className={`inline-block rounded-md border px-2 py-1 text-xs ${
                                    provider.status === "ok"
                                      ? "border-green-900/60 bg-green-950/40 text-green-400"
                                      : provider.status === "out_of_credit"
                                        ? "border-amber-900/60 bg-amber-950/40 text-amber-400"
                                        : provider.status === "unconfigured"
                                          ? "border-zinc-700 bg-zinc-800/60 text-zinc-400"
                                          : "border-red-900/60 bg-red-950/40 text-red-400"
                                  }`}
                                >
                                  {provider.status === "ok"
                                    ? "OK"
                                    : provider.status === "out_of_credit"
                                      ? "Out of credit"
                                      : provider.status === "unconfigured"
                                        ? "Not configured"
                                        : "Error"}
                                </span>
                              </td>
                              <td className="py-3 pr-4">
                                {provider.balanceUsd === null ? (
                                  <>
                                    <span className="text-zinc-500">—</span>
                                    <p className="mt-1 text-xs text-zinc-600">
                                      {provider.balanceNote ??
                                        "not exposed by provider"}
                                    </p>
                                  </>
                                ) : (
                                  <span className="font-medium text-white">
                                    ${provider.balanceUsd.toFixed(2)}
                                  </span>
                                )}
                              </td>
                              <td className="py-3">
                                <span
                                  className={
                                    provider.configured
                                      ? "text-zinc-300"
                                      : "text-amber-400"
                                  }
                                >
                                  {provider.configured ? "Set" : "Missing"}
                                </span>
                                <p className="mt-1 text-xs text-zinc-600">
                                  {provider.envVar}
                                </p>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h2 className="text-lg font-medium">AI model order</h2>
                  <p className="text-sm text-zinc-400">
                    Configure, independently, the quality-first fallback order
                    for the time estimator and the assistant. The 1st model is
                    the default; if it hits a balance, quota, or auth error the
                    next model in that list is used. These two lists do not
                    affect each other.
                  </p>
                </div>
                {renderChainEditor(
                  "estimator",
                  estimatorChain,
                  "Time estimator",
                  "Models used to estimate how long a task will take.",
                )}
                {renderChainEditor(
                  "assistant",
                  assistantChain,
                  "Assistant",
                  "Models used by the AI assistant and planner.",
                )}

                {/* Per-ORG email/spam waterfall. Scoped to an organization, not
                    the signed-in user, so it carries its own org picker. */}
                {database?.organizations && database.organizations.length > 0
                  ? renderChainEditor(
                      "email",
                      emailAiChain,
                      "Email AI providers",
                      "Models used to triage inbound email and catch spam, for the selected organization. The first provider is tried first; if it hits a quota or auth error the next is used. If all of them fail, Forge falls back to on-device rules.",
                      {
                        models: modelsForSurface("email"),
                        // One select per position in the SAVED chain (never per
                        // selectable model — more models are choosable than the
                        // default chain is long), so every rendered select has a
                        // real value behind it.
                        positions: Math.max(
                          defaultChainIdsFor("email").length,
                          emailAiChain.length,
                        ),
                        onSelect: setEmailChainPosition,
                        disabled: !emailAiEnabled || emailAiLoading,
                        configuredById: Object.fromEntries(
                          emailAiProviders.map((p) => [p.id, p.configured]),
                        ),
                        children: (
                          <div className="mt-4 space-y-3 border-t border-zinc-800 pt-4">
                            <div className="flex items-center gap-3">
                              <label
                                className="w-28 text-sm text-zinc-300"
                                htmlFor="email-ai-org"
                              >
                                Organization
                              </label>
                              <select
                                id="email-ai-org"
                                value={emailAiOrgId ?? ""}
                                onChange={(e) => setEmailAiOrgId(e.target.value)}
                                className="flex-1 rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-white focus:ring-2 focus:ring-theme-primary"
                              >
                                {database.organizations.map((org) => (
                                  <option key={org.id} value={org.id}>
                                    {org.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <label className="flex items-center gap-3 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={emailAiEnabled}
                                disabled={emailAiLoading}
                                onChange={(e) => {
                                  const enabled = e.target.checked;
                                  setEmailAiEnabled(enabled);
                                  void saveEmailAiSettings({
                                    enabled,
                                    chain: emailAiChain,
                                  });
                                }}
                                className="w-5 h-5 rounded border-zinc-600 bg-zinc-800 text-theme-primary focus:ring-2 focus:ring-theme-primary focus:ring-offset-0 focus:ring-offset-zinc-900"
                              />
                              <div>
                                <p className="text-white text-sm">
                                  Use AI to triage this organization&apos;s email
                                </p>
                                <p className="text-xs text-zinc-400">
                                  Turn this off to keep email content on-device:
                                  only the local rules and the private spam
                                  classifier run.
                                </p>
                              </div>
                            </label>
                            {emailAiError ? (
                              <p className="text-xs text-red-400">
                                {emailAiError}
                              </p>
                            ) : null}
                          </div>
                        ),
                      },
                    )
                  : null}

                {spamConfig ? (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
                    <h3 className="text-sm font-medium text-zinc-200">
                      Spam classifier
                    </h3>
                    <p className="mt-1 text-xs text-zinc-500">
                      Read-only runtime config for the private k-NN spam
                      classifier. Set via the SPAM_CONFIDENCE_THRESHOLD and
                      SPAM_FALLBACK_MODE environment variables. The LLM backstop
                      that runs when this classifier is unsure uses the per-org
                      Email AI providers above. Train it from the Email Inbox →
                      AI Rules → Spam Training tab.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 text-zinc-300">
                        Confidence threshold:{" "}
                        <span className="font-medium text-white">
                          {Math.round(spamConfig.confidenceThreshold * 100)}%
                        </span>
                      </span>
                      <span className="rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 text-zinc-300">
                        Fallback mode:{" "}
                        <span className="font-medium text-white">
                          {spamConfig.fallbackMode === "private"
                            ? "Private (k-NN only)"
                            : "LLM backstop"}
                        </span>
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Email Accounts */}
              <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-lg font-medium flex items-center gap-2">
                      <Mail className="w-5 h-5" />
                      Email Accounts
                    </h3>
                    <p className="text-sm text-zinc-400 mt-1">
                      Manage the mailboxes Forge syncs and processes. Connect
                      IMAP, Gmail, or Microsoft 365 accounts.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openMailboxDialog("create", null)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-theme-gradient px-3 py-2 text-sm font-medium text-white"
                  >
                    <Plus className="h-4 w-4" />
                    Add mailbox
                  </button>
                </div>

                {(database?.mailboxes?.length ?? 0) === 0 ? (
                  <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-950/40 px-4 py-6 text-sm text-zinc-500">
                    No mailboxes connected yet. Add one to start syncing email.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(database?.mailboxes ?? []).map((mailbox) => {
                      const status = mailboxStatus(mailbox);
                      const statusToneClass =
                        status.tone === "error"
                          ? "border-red-900/70 bg-red-950/40 text-red-300"
                          : status.tone === "ok"
                            ? "border-emerald-900/70 bg-emerald-950/40 text-emerald-300"
                            : "border-zinc-700 bg-zinc-900 text-zinc-400";
                      return (
                        <div
                          key={mailbox.id}
                          className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="truncate font-medium text-white">
                                  {mailbox.emailAddress}
                                </p>
                                <span
                                  className={cn(
                                    "rounded-full border px-2 py-0.5 text-xs",
                                    statusToneClass,
                                  )}
                                >
                                  {status.label}
                                </span>
                              </div>
                              <p className="mt-1 text-sm text-zinc-400">
                                {mailboxProviderLabel(mailbox.provider)}
                                {mailbox.name ? ` · ${mailbox.name}` : ""} ·
                                Synced {formatRelativeSync(mailbox.lastSyncedAt)}
                              </p>
                              {status.detail ? (
                                <p className="mt-1 break-words text-xs text-red-300">
                                  {status.detail}
                                </p>
                              ) : null}
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  openMailboxDialog("reauth", mailbox)
                                }
                                title="Reconnect / re-enter credentials"
                                className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white"
                              >
                                <KeyRound className="h-3.5 w-3.5" />
                                Reconnect
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  openMailboxDialog("edit", mailbox)
                                }
                                title="Edit mailbox"
                                aria-label="Edit mailbox"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white"
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setMailboxToDelete(mailbox)}
                                title="Delete mailbox"
                                aria-label="Delete mailbox"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-red-300 transition-colors hover:border-red-700 hover:text-red-200"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
                <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                  <Hourglass className="w-5 h-5" />
                  Daily Focus Capacity
                </h3>
                <p className="text-sm text-zinc-400 mb-6">
                  How many focus hours you realistically have in a day. Today
                  uses this to flag overcommitted plans and to size the daily
                  schedule.
                </p>
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-3">
                    {[
                      { label: "3h", minutes: 180 },
                      { label: "4h", minutes: 240 },
                      { label: "5h", minutes: 300 },
                      { label: "6h", minutes: 360 },
                      { label: "8h", minutes: 480 },
                    ].map((preset) => (
                      <button
                        key={preset.minutes}
                        type="button"
                        onClick={async () => {
                          setDailyCapacityMinutes(preset.minutes);
                          await handleAutoSave({
                            dailyCapacityMinutes: preset.minutes,
                          });
                        }}
                        className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                          dailyCapacityMinutes === preset.minutes
                            ? "border-theme-primary bg-zinc-800 text-white"
                            : "border-zinc-800 bg-zinc-950/40 text-zinc-300 hover:border-zinc-700"
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <label className="flex max-w-xs flex-col gap-2">
                    <span className="text-sm font-medium text-white">
                      Custom (minutes)
                    </span>
                    <input
                      type="number"
                      min={30}
                      max={1440}
                      step={15}
                      value={dailyCapacityMinutes}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        setDailyCapacityMinutes(
                          Number.isFinite(next)
                            ? Math.min(1440, Math.max(30, Math.round(next)))
                            : 300,
                        );
                      }}
                      onBlur={async (e) => {
                        const next = Number(e.target.value);
                        const clamped = Number.isFinite(next)
                          ? Math.min(1440, Math.max(30, Math.round(next)))
                          : 300;
                        setDailyCapacityMinutes(clamped);
                        await handleAutoSave({
                          dailyCapacityMinutes: clamped,
                        });
                      }}
                      className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white outline-none transition-colors focus:border-theme-primary"
                    />
                  </label>
                  <p className="text-xs text-zinc-500">
                    Range: 30 minutes to 24 hours. Default: 5 hours (300
                    minutes).
                  </p>
                </div>
              </div>

              <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
                <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                  <Clock3 className="w-5 h-5" />
                  Email Delete Undo
                </h3>
                <p className="text-sm text-zinc-400 mb-6">
                  Keep deleted emails undoable before the action finalizes.
                </p>
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-3">
                    {[15, 30, 60, 120].map((seconds) => (
                      <button
                        key={seconds}
                        type="button"
                        onClick={async () => {
                          setEmailDeleteUndoSeconds(seconds);
                          await handleAutoSave({
                            emailDeleteUndoSeconds: seconds,
                          });
                        }}
                        className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                          emailDeleteUndoSeconds === seconds
                            ? "border-theme-primary bg-zinc-800 text-white"
                            : "border-zinc-800 bg-zinc-950/40 text-zinc-300 hover:border-zinc-700"
                        }`}
                      >
                        {seconds >= 60 && seconds % 60 === 0
                          ? `${seconds / 60} min`
                          : `${seconds}s`}
                      </button>
                    ))}
                  </div>
                  <label className="flex max-w-xs flex-col gap-2">
                    <span className="text-sm font-medium text-white">
                      Custom delay in seconds
                    </span>
                    <input
                      type="number"
                      min={5}
                      max={3600}
                      step={5}
                      value={emailDeleteUndoSeconds}
                      onChange={(e) => {
                        setEmailDeleteUndoSeconds(
                          clampEmailDeleteUndoSeconds(Number(e.target.value)),
                        );
                      }}
                      onBlur={async (e) => {
                        const value = clampEmailDeleteUndoSeconds(
                          Number(e.target.value),
                        );
                        setEmailDeleteUndoSeconds(value);
                        await handleAutoSave({
                          emailDeleteUndoSeconds: value,
                        });
                      }}
                      className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white outline-none transition-colors focus:border-theme-primary"
                    />
                  </label>
                  <p className="text-xs text-zinc-500">
                    Range: 5 seconds to 60 minutes. Default: 60 seconds.
                  </p>
                </div>
              </div>

              {/* Email Inbox Reading Pane Width (Desktop) */}
              <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
                <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                  <Mail className="w-5 h-5" />
                  Email Reading Pane Width (Desktop)
                </h3>
                <p className="text-sm text-zinc-400 mb-6">
                  Default width of the Email Inbox conversation pane as a
                  percentage of the screen, used before you drag the divider to
                  set your own size.
                </p>
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-3">
                    {EMAIL_PANEL_WIDTH_PERCENT_OPTIONS.map((percent) => (
                      <button
                        key={percent}
                        type="button"
                        onClick={async () => {
                          setEmailPanelDefaultWidthPct(percent);
                          await handleAutoSave({
                            emailPanelDefaultWidthPct: percent,
                          });
                        }}
                        className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                          emailPanelDefaultWidthPct === percent
                            ? "border-theme-primary bg-zinc-800 text-white"
                            : "border-zinc-800 bg-zinc-950/40 text-zinc-300 hover:border-zinc-700"
                        }`}
                      >
                        {percent}%
                      </button>
                    ))}
                  </div>
                  <label className="flex max-w-xs flex-col gap-2">
                    <span className="text-sm font-medium text-white">
                      Custom (percent)
                    </span>
                    <input
                      type="number"
                      min={MIN_EMAIL_PANEL_WIDTH_PERCENT}
                      max={MAX_EMAIL_PANEL_WIDTH_PERCENT}
                      step={5}
                      value={emailPanelDefaultWidthPct}
                      onChange={(e) => {
                        setEmailPanelDefaultWidthPct(
                          clampEmailPanelWidthPercent(Number(e.target.value)),
                        );
                      }}
                      onBlur={async (e) => {
                        const value = clampEmailPanelWidthPercent(
                          Number(e.target.value),
                        );
                        setEmailPanelDefaultWidthPct(value);
                        await handleAutoSave({
                          emailPanelDefaultWidthPct: value,
                        });
                      }}
                      className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white outline-none transition-colors focus:border-theme-primary"
                    />
                  </label>
                  <p className="text-xs text-zinc-500">
                    Range: {MIN_EMAIL_PANEL_WIDTH_PERCENT}% to{" "}
                    {MAX_EMAIL_PANEL_WIDTH_PERCENT}%. Default:{" "}
                    {DEFAULT_EMAIL_PANEL_WIDTH_PERCENT}%.
                  </p>
                </div>
              </div>

              {/* Priority Colors */}
              <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
                <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                  <Flag className="w-5 h-5" />
                  Priority Colors
                </h3>
                <p className="text-sm text-zinc-400 mb-6">
                  Choose a base color for task priorities. Shades are
                  automatically generated - brighter colors indicate higher
                  priority.
                </p>

                {/* Color presets */}
                <div className="mb-6">
                  <p className="text-sm text-zinc-500 mb-3">Suggested colors</p>
                  <div className="flex flex-wrap gap-3">
                    {[
                      { color: "#22c55e", name: "Green" },
                      { color: "#3b82f6", name: "Blue" },
                      { color: "#8b5cf6", name: "Purple" },
                      { color: "#f59e0b", name: "Amber" },
                      { color: "#ec4899", name: "Pink" },
                      { color: "#06b6d4", name: "Cyan" },
                      { color: "#f97316", name: "Orange" },
                      { color: "#14b8a6", name: "Teal" },
                    ].map(({ color, name }) => (
                      <button
                        key={color}
                        onClick={async () => {
                          setPriorityColor(color);
                          await handleAutoSave({ priorityColor: color });
                        }}
                        className={`relative w-10 h-10 rounded-lg transition-all ${
                          priorityColor === color
                            ? "ring-2 ring-white ring-offset-2 ring-offset-zinc-900 scale-110"
                            : "hover:scale-105"
                        }`}
                        style={{ backgroundColor: color }}
                        title={name}
                      >
                        {priorityColor === color && (
                          <Check className="w-5 h-5 text-white absolute inset-0 m-auto" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom color picker */}
                <div className="mb-6">
                  <p className="text-sm text-zinc-500 mb-3">
                    Or choose a custom color
                  </p>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={priorityColor || "#22c55e"}
                      onChange={async (e) => {
                        setPriorityColor(e.target.value);
                        await handleAutoSave({ priorityColor: e.target.value });
                      }}
                      className="w-12 h-10 rounded-lg border-0 cursor-pointer bg-transparent"
                    />
                    <input
                      type="text"
                      value={priorityColor || "#22c55e"}
                      onChange={async (e) => {
                        const val = e.target.value;
                        if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                          setPriorityColor(val);
                          await handleAutoSave({ priorityColor: val });
                        }
                      }}
                      className="bg-zinc-800 text-white text-sm px-3 py-2 rounded-lg border border-zinc-700 w-28 font-mono"
                      placeholder="#22c55e"
                    />
                  </div>
                </div>

                {/* Preview */}
                <div>
                  <p className="text-sm text-zinc-500 mb-3">Preview</p>
                  <div className="flex items-center gap-6">
                    {[1, 2, 3, 4].map((priority) => {
                      const baseColor = priorityColor || "#22c55e";
                      // Generate shade based on priority
                      const hex = baseColor.replace("#", "");
                      const r = parseInt(hex.slice(0, 2), 16) / 255;
                      const g = parseInt(hex.slice(2, 4), 16) / 255;
                      const b = parseInt(hex.slice(4, 6), 16) / 255;

                      const max = Math.max(r, g, b);
                      const min = Math.min(r, g, b);
                      let h = 0,
                        s = 0,
                        l = (max + min) / 2;

                      if (max !== min) {
                        const d = max - min;
                        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                        switch (max) {
                          case r:
                            h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
                            break;
                          case g:
                            h = ((b - r) / d + 2) / 6;
                            break;
                          case b:
                            h = ((r - g) / d + 4) / 6;
                            break;
                        }
                      }

                      const lightness =
                        priority === 1
                          ? 0.45
                          : priority === 2
                            ? 0.55
                            : priority === 3
                              ? 0.65
                              : 0.75;
                      const saturation =
                        priority === 1
                          ? Math.min(s * 1.2, 1)
                          : priority === 2
                            ? s
                            : priority === 3
                              ? s * 0.8
                              : s * 0.6;

                      const hue2rgb = (p: number, q: number, t: number) => {
                        if (t < 0) t += 1;
                        if (t > 1) t -= 1;
                        if (t < 1 / 6) return p + (q - p) * 6 * t;
                        if (t < 1 / 2) return q;
                        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                        return p;
                      };
                      const q =
                        lightness < 0.5
                          ? lightness * (1 + saturation)
                          : lightness + saturation - lightness * saturation;
                      const p = 2 * lightness - q;
                      const rs = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
                      const gs = Math.round(hue2rgb(p, q, h) * 255);
                      const bs = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
                      const shade = `#${rs.toString(16).padStart(2, "0")}${gs.toString(16).padStart(2, "0")}${bs.toString(16).padStart(2, "0")}`;

                      return (
                        <div
                          key={priority}
                          className="flex flex-col items-center gap-2"
                        >
                          <Flag className="w-6 h-6" style={{ color: shade }} />
                          <span className="text-xs text-zinc-500">
                            P{priority}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Integrations Section */}
          <div>
            <h2 className="text-xl font-semibold mb-6">Integrations</h2>
            <div className="space-y-6">
              {profileLoading ? (
                <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
                  <div className="flex items-center gap-2 mb-4">
                    <Skeleton className="h-5 w-5 rounded" />
                    <Skeleton className="h-5 w-40" />
                  </div>
                  <Skeleton className="h-4 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/2 mb-6" />
                  <Skeleton className="h-10 w-44" />
                </div>
              ) : profile?.id ? (
                <TodoistIntegration userId={profile.id} />
              ) : (
                <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
                  <p className="text-sm text-zinc-400">
                    User profile not found. Please refresh the page.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Personal Access Tokens */}
          <div id="personal-access-keys">
            <h2 className="text-xl font-semibold mb-6">
              Personal Access Tokens
            </h2>
            <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
              <div className="mb-5 rounded-2xl border border-emerald-800/50 bg-emerald-950/30 p-4 text-sm text-emerald-100">
                <div className="font-medium">Focus: Time bootstrap</div>
                <p className="mt-1 text-emerald-200/80">
                  Create a PAT with the <code>admin</code> scope when you want
                  AI or external tooling to generate Focus: Time organization
                  tokens.
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <Link
                    href="/docs/focus-time-agent"
                    className="inline-flex items-center gap-2 rounded-full border border-emerald-700/60 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:border-emerald-500 hover:text-white"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Public Focus: Time Prompt
                  </Link>
                </div>
              </div>
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-lg font-medium flex items-center gap-2">
                  <KeyRound className="w-5 h-5" />
                  Manage PATs
                </h3>
                <span className="text-xs text-zinc-500">
                  Use for API access
                </span>
              </div>
              <p className="text-sm text-zinc-400 mt-1 mb-6">
                Create a token to authenticate external scripts and
                integrations.
              </p>

              <div className="grid gap-3 md:grid-cols-[1.5fr_1fr_auto] items-end">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Token Name
                  </label>
                  <input
                    type="text"
                    value={personalTokenName}
                    onChange={(e) => setPersonalTokenName(e.target.value)}
                    placeholder="CI integration"
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:border-theme-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Expires (required)
                  </label>
                  <input
                    type="datetime-local"
                    value={personalTokenExpiresAt}
                    onChange={(e) => setPersonalTokenExpiresAt(e.target.value)}
                    // Open the native date+time picker on click/focus, not just
                    // when the small calendar icon is tapped.
                    onClick={(e) => {
                      try {
                        (e.currentTarget as any).showPicker?.();
                      } catch {}
                    }}
                    onFocus={(e) => {
                      try {
                        (e.currentTarget as any).showPicker?.();
                      } catch {}
                    }}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:border-theme-primary focus:outline-none cursor-pointer [color-scheme:dark]"
                  />
                </div>
                <button
                  type="button"
                  onClick={createPersonalAccessToken}
                  className="px-4 py-2 h-10 rounded-lg bg-theme-gradient text-white hover:opacity-90"
                >
                  Create
                </button>
              </div>

              <div className="mt-4">
                <p className="text-sm text-zinc-300 mb-2">Scopes</p>
                <div className="flex flex-wrap gap-4">
                  {ALLOWED_API_SCOPES.map((scope) => (
                    <label
                      key={scope}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={
                          scope === "read"
                            ? personalTokenScopes.includes("read")
                            : personalTokenScopes.includes(scope)
                        }
                        onChange={(e) =>
                          togglePersonalTokenScope(scope, e.target.checked)
                        }
                        disabled={scope === "read"}
                        className="w-4 h-4 rounded border-zinc-600 bg-zinc-700 text-theme-primary focus:ring-2 focus:ring-theme-primary focus:ring-offset-0 focus:ring-offset-zinc-900"
                      />
                      <span className="text-zinc-300">
                        {scope} {scope === "read" ? "(required)" : ""}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {personalTokensError && (
                <p className="text-sm text-red-300 mt-3">
                  {personalTokensError}
                </p>
              )}

              {personalTokenCreatedSecret && (
                <div className="mt-4 rounded border border-emerald-700/40 bg-emerald-900/20 p-3 text-sm text-emerald-200">
                  <div className="flex flex-wrap items-center gap-2 justify-between">
                    <p>
                      New key created for{" "}
                      <strong>{createdPersonalTokenName}</strong> — copy now and
                      store it securely. It is not shown again.
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        copyTokenSecret(personalTokenCreatedSecret)
                      }
                      className="px-2 py-1 text-xs border border-emerald-700 rounded hover:bg-emerald-800/40"
                    >
                      {copiedPersonalTokenSecret ? "Copied" : "Copy key"}
                    </button>
                  </div>
                  <p className="font-mono text-xs mt-2 break-all">
                    {personalTokenCreatedSecret}
                  </p>
                </div>
              )}

              {personalTokensLoading && personalAccessTokens.length === 0 && (
                <div className="mt-4 grid gap-3">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-zinc-800 p-3 bg-zinc-950/60"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-40" />
                          <Skeleton className="h-3 w-56" />
                          <Skeleton className="h-3 w-48" />
                          <Skeleton className="h-3 w-32" />
                        </div>
                        <Skeleton className="h-7 w-16 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {personalAccessTokens.length === 0 && !personalTokensLoading ? (
                <div className="text-sm text-zinc-500 mt-4">
                  No personal access tokens yet.
                </div>
              ) : (
                (() => {
                  const tokenIsExpired = (t: ApiKeyMeta) =>
                    !!t.expiresAt &&
                    !Number.isNaN(Date.parse(t.expiresAt)) &&
                    Date.parse(t.expiresAt) <= Date.now();
                  const groups = {
                    active: personalAccessTokens.filter(
                      (t) => t.isActive && !tokenIsExpired(t),
                    ),
                    expired: personalAccessTokens.filter(
                      (t) => t.isActive && tokenIsExpired(t),
                    ),
                    revoked: personalAccessTokens.filter((t) => !t.isActive),
                  };
                  const tabs: {
                    key: "active" | "expired" | "revoked";
                    label: string;
                  }[] = [
                    { key: "active", label: "Active" },
                    { key: "expired", label: "Expired" },
                    { key: "revoked", label: "Revoked" },
                  ];
                  const visible = groups[personalTokenTab];
                  return (
                    <div className="mt-4">
                      <div className="flex flex-wrap gap-1 border-b border-zinc-800 mb-3">
                        {tabs.map((tab) => (
                          <button
                            key={tab.key}
                            type="button"
                            onClick={() => setPersonalTokenTab(tab.key)}
                            className={`px-3 py-1.5 text-sm rounded-t-lg border-b-2 -mb-px transition-colors ${
                              personalTokenTab === tab.key
                                ? "border-theme-primary text-white"
                                : "border-transparent text-zinc-400 hover:text-zinc-200"
                            }`}
                          >
                            {tab.label}
                            <span className="ml-1.5 text-xs text-zinc-500">
                              {groups[tab.key].length}
                            </span>
                          </button>
                        ))}
                      </div>
                      {visible.length === 0 ? (
                        <div className="text-sm text-zinc-500 py-4">
                          No {personalTokenTab} tokens.
                        </div>
                      ) : (
                        <div className="grid gap-3">
                          {visible.map((token) => (
                            <div
                              key={token.id}
                              className="rounded-lg border border-zinc-800 p-3 bg-zinc-950/60"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <p className="font-medium flex items-center gap-2">
                                    {token.name}
                                    {!token.isActive && (
                                      <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                                        Revoked
                                      </span>
                                    )}
                                    {token.isActive && tokenIsExpired(token) && (
                                      <span className="text-xs px-2 py-0.5 rounded bg-amber-900/40 text-amber-300 border border-amber-800/80">
                                        Expired
                                      </span>
                                    )}
                                  </p>
                                  <p className="text-xs text-zinc-400 mt-1">
                                    {token.scopes.join(", ")} · Expires:{" "}
                                    {token.expiresAt || "No expiry"}
                                  </p>
                                  <p className="text-xs text-zinc-500 mt-1">
                                    Created: {token.createdAt} · Last used:{" "}
                                    {token.lastUsedAt || "Never"}
                                  </p>
                                  <p className="text-xs font-mono text-zinc-500 mt-1">
                                    {token.maskedKey}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    revokePersonalAccessToken(token.id)
                                  }
                                  className={`px-3 py-1.5 rounded text-xs ${token.isActive ? "bg-red-600 hover:bg-red-500" : "bg-zinc-700"} text-white`}
                                  disabled={!token.isActive}
                                >
                                  Revoke
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()
              )}
            </div>
          </div>

          {/* Calendar Feed Section */}
          <div>
            <h2 className="text-xl font-semibold mb-6">Calendar Feed</h2>
            <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800 space-y-4">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                iCal Subscription
              </h3>
              <p className="text-sm text-zinc-400">
                Subscribe to your tasks in Google Calendar, Apple Calendar, or
                any app that supports iCal feeds. Tasks with dates will appear
                as calendar events.
              </p>

              {calendarToken ? (
                <>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={getCalendarFeedUrl()}
                      className="flex-1 bg-zinc-800 text-zinc-300 text-sm px-3 py-2.5 rounded-lg border border-zinc-700 font-mono truncate"
                    />
                    <button
                      type="button"
                      onClick={copyCalendarUrl}
                      className="p-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-lg transition-colors border border-zinc-700"
                      title="Copy URL"
                    >
                      {calendarCopied ? (
                        <Check className="w-4 h-4 text-green-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={regenerateCalendarToken}
                      disabled={calendarLoading}
                      className="p-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-lg transition-colors border border-zinc-700 disabled:opacity-50"
                      title="Regenerate token (invalidates existing subscriptions)"
                    >
                      <RefreshCw
                        className={`w-4 h-4 ${calendarLoading ? "animate-spin" : ""}`}
                      />
                    </button>
                  </div>

                  <div className="text-xs text-zinc-500 space-y-1">
                    <p>
                      <strong>Google Calendar:</strong> Settings &gt; Other
                      calendars &gt; From URL &gt; paste the URL above.
                    </p>
                    <p>
                      <strong>Apple Calendar:</strong> File &gt; New Calendar
                      Subscription &gt; paste the URL above.
                    </p>
                    <p>
                      Regenerating the token will invalidate any existing
                      subscriptions.
                    </p>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <Skeleton className="h-[42px] flex-1 rounded-lg" />
                  <Skeleton className="h-[42px] w-[42px] rounded-lg" />
                  <Skeleton className="h-[42px] w-[42px] rounded-lg" />
                </div>
              )}
            </div>
          </div>

          {/* Organizations Section */}
          <div>
            <h2 className="text-xl font-semibold mb-6">Organizations</h2>
            <div className="bg-zinc-900 rounded-lg border border-zinc-800">
              {database?.organizations && database.organizations.length > 0 ? (
                <div className="divide-y divide-zinc-800">
                  {database.organizations.map((org) => (
                    <div
                      key={org.id}
                      className="p-4 flex items-center justify-between hover:bg-zinc-800/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-lg flex-shrink-0"
                          style={{
                            background:
                              org.color?.startsWith("linear-gradient") ||
                              org.color?.startsWith("radial-gradient")
                                ? org.color
                                : org.color || "#EA580C",
                            backgroundColor: org.color?.startsWith("#")
                              ? org.color
                              : undefined,
                          }}
                        />
                        <div>
                          <h3 className="font-medium flex items-center gap-2">
                            {org.name}
                            {org.ownerId === database.users?.[0]?.id && (
                              <span className="text-xs bg-zinc-700 text-zinc-300 px-2 py-0.5 rounded">
                                Owner
                              </span>
                            )}
                          </h3>
                          {org.description && (
                            <p className="text-sm text-zinc-400">
                              {org.description}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-1">
                            <p className="text-xs text-zinc-500">
                              {
                                database.projects.filter(
                                  (p) => p.organizationId === org.id,
                                ).length
                              }{" "}
                              projects
                            </p>
                            {org.memberIds && org.memberIds.length > 0 && (
                              <>
                                <span className="text-xs text-zinc-600">•</span>
                                <p className="text-xs text-zinc-500">
                                  {org.memberIds.length}{" "}
                                  {org.memberIds.length === 1
                                    ? "member"
                                    : "members"}
                                </p>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedOrganization(org);
                          setOrganizationSettingsInitialTab("details");
                        }}
                        className="p-2 hover:bg-zinc-700 rounded-lg transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : database ? (
                <div className="p-8 text-center text-zinc-500">
                  No organizations found
                </div>
              ) : (
                <div className="divide-y divide-zinc-800">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div
                      key={i}
                      className="p-4 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <Skeleton className="w-10 h-10 rounded-lg flex-shrink-0" />
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-40" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                      </div>
                      <Skeleton className="w-8 h-8 rounded-lg" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Developer (de-emphasized) */}
          <div className="pt-6 mt-8 border-t border-zinc-800/60">
            <Link
              href="/developer/api"
              className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              API Docs
            </Link>
          </div>
        </div>
      </div>

      {/* Organization Settings Modal */}
      {selectedOrganization && database && (
        <OrganizationSettingsModal
          organization={selectedOrganization}
          projects={database.projects.filter(
            (p) => p.organizationId === selectedOrganization.id,
          )}
          allProjects={database.projects}
          users={database.users}
          currentUserId={profile?.id || database.users?.[0]?.id}
          currentUserRole={profile?.role || null}
          canManageApiKeys={isSuperOrAdmin}
          initialActiveTab={organizationSettingsInitialTab}
          onClose={() => {
            setSelectedOrganization(null);
            setOrganizationSettingsInitialTab("details");
          }}
          onSave={async (updates) => {
            try {
              const response = await fetch(
                `/api/organizations/${selectedOrganization.id}`,
                {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(updates),
                },
              );

              if (response.ok) {
                // Refresh data
                await fetchData();
                setSelectedOrganization(null);
                setOrganizationSettingsInitialTab("details");
              }
            } catch (error) {
              console.error("Error updating organization:", error);
            }
          }}
          onProjectAssociation={async (projectId, organizationIds) => {
            try {
              const response = await fetch(`/api/projects/${projectId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ organizationId: organizationIds[0] }), // For now, just use the first org
              });

              if (response.ok) {
                // Refresh data
                await fetchData();
              }
            } catch (error) {
              console.error("Error updating project association:", error);
            }
          }}
          onUserInvite={async (email, organizationId, firstName, lastName) => {
            try {
              // Get organization name for the invitation
              const org = database.organizations.find(
                (o) => o.id === organizationId,
              );
              const organizationName = org?.name || "Organization";

              const response = await fetch("/api/invite-user", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  email,
                  organizationId,
                  organizationName,
                  firstName,
                  lastName,
                }),
              });

              const result = await response.json();

              if (response.ok) {
                // Refresh data to show the pending user
                await fetchData();

                // Show appropriate message based on whether email was sent
                showSuccess(
                  "Invitation sent!",
                  `Email sent to ${firstName} ${lastName} (${email})`,
                );
              } else {
                // Show error with helpful information
                if (result.helpUrl) {
                  showError(
                    "Email not configured",
                    "Please configure SMTP settings in Supabase dashboard to send invitation emails",
                  );
                } else {
                  showError(
                    "Invitation failed",
                    result.error || "Failed to send invitation",
                  );
                }
              }
            } catch (error) {
              console.error("Error inviting user:", error);
              showError(
                "Invitation failed",
                "Failed to send invitation. Please try again.",
              );
            }
          }}
          onUserAdd={async (userId, organizationId) => {
            try {
              // Get current organization
              const org = database.organizations.find(
                (o) => o.id === organizationId,
              );
              if (!org) return;

              // Add user to organization members
              const updatedMemberIds = [...(org.memberIds || []), userId];

              const response = await fetch(
                `/api/organizations/${organizationId}`,
                {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ memberIds: updatedMemberIds }),
                },
              );

              if (!response.ok) {
                const result = await response.json().catch(() => null);
                throw new Error(
                  result?.error || "Failed to add user to organization.",
                );
              }

              await fetchData();
            } catch (error) {
              console.error("Error adding user to organization:", error);
              throw error;
            }
          }}
          onUserRemove={async (userId, organizationId) => {
            try {
              // Get current organization
              const org = database.organizations.find(
                (o) => o.id === organizationId,
              );
              if (!org) return;

              // Remove user from organization members
              const updatedMemberIds = (org.memberIds || []).filter(
                (id) => id !== userId,
              );

              const response = await fetch(
                `/api/organizations/${organizationId}`,
                {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ memberIds: updatedMemberIds }),
                },
              );

              if (!response.ok) {
                const result = await response.json().catch(() => null);
                throw new Error(
                  result?.error || "Failed to remove user from organization.",
                );
              }

              await fetchData();
            } catch (error) {
              console.error("Error removing user from organization:", error);
              throw error;
            }
          }}
          onUserRoleChange={async (userId, organizationId, role) => {
            try {
              const response = await fetch(`/api/users/${userId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role, organizationId }),
              });

              if (response.ok) {
                await fetchData();
                return;
              }

              const result = await response.json().catch(() => null);
              showError(
                "Role update failed",
                result?.error || "Failed to update user role.",
              );
            } catch (error) {
              console.error("Error updating user role:", error);
              showError("Role update failed", "Failed to update user role.");
            }
          }}
          onResendInvite={async (userId) => {
            try {
              const user = database.users.find((u) => u.id === userId);
              if (!user) {
                throw new Error("User not found");
              }

              const response = await fetch("/api/resend-invite", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId }),
              });

              const result = await response.json();

              if (response.ok) {
                await fetchData();
                return {
                  message: result.message,
                  emailDelivery: result.emailDelivery || null,
                };
              }

              throw new Error(result.error || "Failed to resend invite");
            } catch (error) {
              console.error("Error resending invite:", error);
              throw error;
            }
          }}
          onCancelInvite={async (userId, organizationId) => {
            try {
              const response = await fetch("/api/cancel-invite", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, organizationId }),
              });

              const result = await response.json();
              if (!response.ok) {
                throw new Error(result.error || "Failed to cancel invite");
              }

              await fetchData();
              return { message: result.message };
            } catch (error) {
              console.error("Error cancelling invite:", error);
              throw error;
            }
          }}
        />
      )}

      <MailboxFormDialog
        open={mailboxDialogOpen}
        onOpenChange={setMailboxDialogOpen}
        mailbox={mailboxDialogMode === "create" ? null : activeMailbox}
        mode={mailboxDialogMode}
        organizations={database?.organizations ?? []}
        onSaved={() => {
          showSuccess(
            mailboxDialogMode === "create"
              ? "Mailbox connected"
              : "Mailbox updated",
          );
          fetchData();
        }}
      />

      <ConfirmDialog
        open={Boolean(mailboxToDelete)}
        onOpenChange={(open) => !open && setMailboxToDelete(null)}
        title="Remove mailbox?"
        description={
          mailboxToDelete
            ? `Disconnect ${mailboxToDelete.emailAddress}? Forge will stop syncing this mailbox.`
            : undefined
        }
        confirmLabel="Remove"
        destructive
        isLoading={deletingMailbox}
        onConfirm={handleDeleteMailbox}
      />
    </div>
  );
}
