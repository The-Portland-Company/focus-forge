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
  Copy,
  RefreshCw,
  KeyRound,
  ExternalLink,
  Mail,
  Plus,
  Trash2,
} from "lucide-react";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { UserAvatar } from "@/components/user-avatar";
import { OrganizationSettingsModal } from "@/components/organization-settings-modal";
import { TodoistIntegration } from "@/components/todoist-integration";
import { Database, EmailSignature, Organization } from "@/lib/types";
import { useUserProfile } from "@/lib/supabase/hooks";
import {
  applyTheme,
  getDatabaseThemePreset,
  persistThemePreference,
  readStoredThemePreference,
} from "@/lib/theme-utils";
import { ThemePreset, DEFAULT_THEME_PRESET } from "@/lib/theme-constants";
import { useToast } from "@/contexts/ToastContext";
import { MEMOJI_OPTIONS } from "@/lib/memoji";
import { ALLOWED_API_SCOPES, type ApiKeyMeta } from "@/lib/api/keys/types";
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
import { cn } from "@/lib/utils";

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
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [personalAccessTokens, setPersonalAccessTokens] = useState<ApiKeyMeta[]>([]);
  const [personalTokensLoading, setPersonalTokensLoading] = useState(false);
  const [personalTokensError, setPersonalTokensError] = useState<string | null>(
    null,
  );
  const [personalTokenName, setPersonalTokenName] = useState("");
  const [personalTokenExpiresAt, setPersonalTokenExpiresAt] = useState("");
  const [personalTokenScopes, setPersonalTokenScopes] = useState<string[]>(["read"]);
  const [personalTokenCreatedSecret, setPersonalTokenCreatedSecret] = useState<
    string | null
  >(null);
  const [createdPersonalTokenName, setCreatedPersonalTokenName] = useState("");
  const [copiedPersonalTokenSecret, setCopiedPersonalTokenSecret] = useState(false);
  const [sectionFromUrl, setSectionFromUrl] = useState<string | null>(null);
  const [organizationFromUrl, setOrganizationFromUrl] = useState<string | null>(
    null,
  );
  const [apiSectionAutoscrollHandled, setApiSectionAutoscrollHandled] = useState(
    false,
  );
  const [selectedOrganization, setSelectedOrganization] =
    useState<Organization | null>(null);
  const [organizationSettingsInitialTab, setOrganizationSettingsInitialTab] =
    useState<"details" | "api-keys">("details");
  const [calendarToken, setCalendarToken] = useState<string | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarCopied, setCalendarCopied] = useState(false);
  const [emailSignatures, setEmailSignatures] = useState<EmailSignature[]>([]);
  const [hideEmailSignatures, setHideEmailSignatures] = useState(true);
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
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSectionFromUrl(params.get("section"));
    setOrganizationFromUrl(params.get("organizationId"));
  }, []);

  useEffect(() => {
    fetchData();
    fetchCalendarToken();
    fetchPersonalAccessTokens();
  }, []);

  useEffect(() => {
    if (!profile?.id) return;

    const loadedSignatures = loadEmailSignatures(profile.id);
    setEmailSignatures(loadedSignatures);
    setHideEmailSignatures(loadHideEmailSignaturesPreference(profile.id));

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
      const base = new Set(prev.includes("read") ? [...prev] : [...prev, "read"]);
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
    if (
      sectionFromUrl === "organization-api-keys" &&
      organizationFromUrl
    ) {
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
  }, [sectionFromUrl, organizationFromUrl, database, apiSectionAutoscrollHandled]);

  // Load profile settings from Supabase
  useEffect(() => {
    if (profile && !profileLoading) {
      const userColor =
        profile.profile_color ||
        "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";
      const userAnimations = profile.animations_enabled !== false;
      const userTheme = readStoredThemePreference(
        profile.theme_preset,
        profile.id,
      );
      const userMemoji = profile.profile_memoji || null;
      const userPriorityColor = (profile as any).priority_color || "#22c55e"; // Default green

      setProfileColor(userColor);
      setAnimationsEnabled(userAnimations);
      setThemePreset(userTheme);
      setProfileMemoji(userMemoji);
      setPriorityColor(userPriorityColor);

      // Apply complete theme immediately when profile loads
      applyTheme(userTheme, userColor, userAnimations);
    }
  }, [profile, profileLoading]);

  const handleAutoSave = async (updates: {
    profileColor?: string;
    profileMemoji?: string | null;
    priorityColor?: string;
    animationsEnabled?: boolean;
    themePreset?: ThemePreset;
  }) => {
    setSaveStatus("saving");
    try {
      // Apply theme immediately for instant feedback
      const currentTheme = updates.themePreset ?? themePreset;
      const currentColor = updates.profileColor ?? profileColor;
      const currentAnimations =
        updates.animationsEnabled ?? animationsEnabled ?? true;
      const prefersDark =
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function"
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
        if (updates.themePreset !== undefined) {
          profileUpdates.theme_preset = getDatabaseThemePreset(
            updates.themePreset,
            prefersDark,
          );
        }

        const result = await updateProfile(profileUpdates);
        const error = result?.error;

        if (!error) {
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus("idle"), 2000);
        } else {
          setSaveStatus("error");
          setTimeout(() => setSaveStatus("idle"), 3000);
        }
      }
    } catch (error) {
      console.error("Error saving settings:", error);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
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
                              <span className="rounded-full border border-[rgb(var(--theme-primary-rgb))]/40 bg-[rgb(var(--theme-primary-rgb))]/12 px-2 py-0.5 text-[10px] uppercase tracking-wide text-[rgb(var(--theme-primary-rgb))]">
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
                        placeholder={"Best,\nSpencer Hill\nThe Portland Company"}
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
                                  onClick={() => toggleSignatureMailbox(mailboxId)}
                                  className="rounded-full border border-[rgb(var(--theme-primary-rgb))]/40 bg-[rgb(var(--theme-primary-rgb))]/12 px-3 py-1 text-xs text-[rgb(var(--theme-primary-rgb))]"
                                >
                                  {mailbox.name}
                                </button>
                              );
                            })}
                          </div>
                          <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/60 p-2">
                            {filteredSignatureMailboxes.map((mailbox) => {
                              const isSelected = signatureForm.mailboxIds.includes(
                                mailbox.id,
                              );
                              return (
                                <button
                                  key={mailbox.id}
                                  type="button"
                                  onClick={() => toggleSignatureMailbox(mailbox.id)}
                                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                                    isSelected
                                      ? "bg-[rgb(var(--theme-primary-rgb))]/12 text-white"
                                      : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <div className="truncate">{mailbox.name}</div>
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
                            onClick={() => handleDeleteSignature(editingSignatureId)}
                            className="inline-flex items-center gap-2 rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-200 transition-colors hover:bg-red-950/50"
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={handleSaveSignature}
                          className="inline-flex items-center gap-2 rounded-lg bg-[rgb(var(--theme-primary-rgb))] px-4 py-2 text-sm font-medium text-white"
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
                  <p className="text-sm text-zinc-400">
                    Loading integrations...
                  </p>
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
            <h2 className="text-xl font-semibold mb-6">Personal Access Tokens</h2>
            <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
              <div className="mb-5 rounded-2xl border border-emerald-800/50 bg-emerald-950/30 p-4 text-sm text-emerald-100">
                <div className="font-medium">Focus: Time bootstrap</div>
                <p className="mt-1 text-emerald-200/80">
                  Create a PAT with the <code>admin</code> scope when you want AI or external tooling to generate Focus: Time organization tokens.
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <Link
                    href="/docs/focus-time-agent"
                    className="inline-flex items-center gap-2 rounded-full border border-emerald-700/60 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:border-emerald-500 hover:text-white"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Public Focus: Time Prompt
                  </Link>
                  <Link
                    href="/developer/api"
                    className="inline-flex items-center gap-2 rounded-full border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:border-zinc-500 hover:text-white"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    API Docs
                  </Link>
                </div>
              </div>
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-lg font-medium flex items-center gap-2">
                  <KeyRound className="w-5 h-5" />
                  Manage PATs
                </h3>
                <span className="text-xs text-zinc-500">Use for API access</span>
              </div>
              <p className="text-sm text-zinc-400 mt-1 mb-6">
                Create a token to authenticate external scripts and integrations.
              </p>

              <div className="grid gap-3 md:grid-cols-[1.5fr_1fr_auto] items-end">
                <div>
                  <label className="block text-sm font-medium mb-2">Token Name</label>
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
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:border-theme-primary focus:outline-none"
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
                    <label key={scope} className="flex items-center gap-2 text-sm">
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
                <p className="text-sm text-red-300 mt-3">{personalTokensError}</p>
              )}

              {personalTokenCreatedSecret && (
                <div className="mt-4 rounded border border-emerald-700/40 bg-emerald-900/20 p-3 text-sm text-emerald-200">
                  <div className="flex flex-wrap items-center gap-2 justify-between">
                    <p>
                      New key created for <strong>{createdPersonalTokenName}</strong> — copy
                      now and store it securely. It is not shown again.
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

              {personalTokensLoading && (
                <p className="text-sm text-zinc-500 mt-3">Loading keys...</p>
              )}
              {personalAccessTokens.length === 0 && !personalTokensLoading ? (
                <div className="text-sm text-zinc-500 mt-4">No personal access tokens yet.</div>
              ) : (
                <div className="mt-4 grid gap-3">
                  {personalAccessTokens.map((token) => (
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
                          </p>
                          <p className="text-xs text-zinc-400 mt-1">
                            {token.scopes.join(", ")} · Expires: {token.expiresAt || "No expiry"}
                          </p>
                          <p className="text-xs text-zinc-500 mt-1">
                            Created: {token.createdAt} · Last used: {token.lastUsedAt || "Never"}
                          </p>
                          <p className="text-xs font-mono text-zinc-500 mt-1">
                            {token.maskedKey}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => revokePersonalAccessToken(token.id)}
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
                <p className="text-sm text-zinc-500">
                  Loading calendar feed...
                </p>
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
              ) : (
                <div className="p-8 text-center text-zinc-500">
                  No organizations found
                </div>
              )}
            </div>
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
    </div>
  );
}
