"use client";

import { useEffect, useState } from "react";
import { Copy, KeyRound, Plus, RefreshCw, Users } from "lucide-react";
import type { User } from "@/lib/types";
import type { TimeTrackingGroup, TimeTrackingToken } from "@/lib/time/types";

interface FocusTimeOrganizationPanelProps {
  organizationId: string;
  users: User[];
  canManage: boolean;
}

export function FocusTimeOrganizationPanel({
  organizationId,
  users,
  canManage,
}: FocusTimeOrganizationPanelProps) {
  const [groups, setGroups] = useState<TimeTrackingGroup[]>([]);
  const [tokens, setTokens] = useState<TimeTrackingToken[]>([]);
  const [tokenName, setTokenName] = useState("");
  const [tokenDescription, setTokenDescription] = useState("");
  const [tokenExpiresAt, setTokenExpiresAt] = useState("");
  const [shareMode, setShareMode] = useState<"private" | "organization" | "selected">("private");
  const [tokenScopes, setTokenScopes] = useState<string[]>(["read"]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupMemberIds, setGroupMemberIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!canManage) return;
    const [tokensResponse, groupsResponse] = await Promise.all([
      fetch(`/api/v1/time/organizations/${organizationId}/tokens`, { credentials: "include" }),
      fetch(`/api/v1/time/organizations/${organizationId}/groups`, { credentials: "include" }),
    ]);

    const [tokensPayload, groupsPayload] = await Promise.all([
      tokensResponse.json(),
      groupsResponse.json(),
    ]);

    if (tokensResponse.ok) {
      setTokens(tokensPayload.data || []);
    }
    if (groupsResponse.ok) {
      setGroups(groupsPayload.data || []);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, canManage]);

  const toggleScope = (scope: string, checked: boolean) => {
    if (scope === "read") return;
    setTokenScopes((current) => {
      const next = new Set(current.includes("read") ? current : [...current, "read"]);
      if (checked) next.add(scope);
      else next.delete(scope);
      return Array.from(next);
    });
  };

  const createToken = async () => {
    setError(null);
    const response = await fetch(`/api/v1/time/organizations/${organizationId}/tokens`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: tokenName,
        description: tokenDescription || null,
        scopes: tokenScopes,
        expiresAt: new Date(tokenExpiresAt).toISOString(),
        shareMode,
        sharedUserIds: shareMode === "selected" ? selectedUserIds : [],
        sharedGroupIds: shareMode === "selected" ? selectedGroupIds : [],
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error?.message || "Failed to create token.");
      return;
    }
    setCreatedSecret(payload.data.secret || null);
    setTokenName("");
    setTokenDescription("");
    setTokenExpiresAt("");
    setTokenScopes(["read"]);
    setSelectedUserIds([]);
    setSelectedGroupIds([]);
    await load();
  };

  const revokeToken = async (tokenId: string) => {
    setError(null);
    const response = await fetch(
      `/api/v1/time/organizations/${organizationId}/tokens/${tokenId}`,
      {
        method: "DELETE",
        credentials: "include",
      },
    );
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error?.message || "Failed to revoke token.");
      return;
    }
    await load();
  };

  const createGroup = async () => {
    setError(null);
    const response = await fetch(`/api/v1/time/organizations/${organizationId}/groups`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: groupName,
        description: groupDescription || null,
        memberIds: groupMemberIds,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error?.message || "Failed to create group.");
      return;
    }
    setGroupName("");
    setGroupDescription("");
    setGroupMemberIds([]);
    await load();
  };

  if (!canManage) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 text-sm text-zinc-500">
        Focus: Time token management is available to organization owners and administrators.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-white">Focus: Time API Tokens</h4>
            <p className="mt-1 text-xs text-zinc-500">
              Create org-scoped tokens for third-party and AI access to the Focus: Time API.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-full border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-white"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input
            value={tokenName}
            onChange={(event) => setTokenName(event.target.value)}
            placeholder="Token name"
            className="rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-500"
          />
          <input
            type="datetime-local"
            value={tokenExpiresAt}
            onChange={(event) => setTokenExpiresAt(event.target.value)}
            className="rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-500"
          />
          <input
            value={tokenDescription}
            onChange={(event) => setTokenDescription(event.target.value)}
            placeholder="Description"
            className="rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-500 md:col-span-2"
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {["read", "write", "admin"].map((scope) => (
            <label
              key={scope}
              className="inline-flex items-center gap-2 rounded-full border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300"
            >
              <input
                type="checkbox"
                checked={tokenScopes.includes(scope)}
                disabled={scope === "read"}
                onChange={(event) => toggleScope(scope, event.target.checked)}
              />
              {scope}
            </label>
          ))}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <select
            value={shareMode}
            onChange={(event) =>
              setShareMode(event.target.value as "private" | "organization" | "selected")
            }
            className="rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-500"
          >
            <option value="private">Private</option>
            <option value="organization">Shared to organization</option>
            <option value="selected">Shared to selected users/groups</option>
          </select>
          <select
            multiple
            value={selectedUserIds}
            onChange={(event) =>
              setSelectedUserIds(Array.from(event.target.selectedOptions).map((option) => option.value))
            }
            disabled={shareMode !== "selected"}
            className="min-h-[120px] rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-50"
          >
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name || `${user.firstName} ${user.lastName}`.trim() || user.email}
              </option>
            ))}
          </select>
          <select
            multiple
            value={selectedGroupIds}
            onChange={(event) =>
              setSelectedGroupIds(Array.from(event.target.selectedOptions).map((option) => option.value))
            }
            disabled={shareMode !== "selected"}
            className="min-h-[120px] rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-50"
          >
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-4">
          <button
            type="button"
            onClick={() => void createToken()}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          >
            <KeyRound className="h-4 w-4" />
            Create Focus: Time Token
          </button>
        </div>
        {createdSecret ? (
          <div className="mt-4 rounded-2xl border border-emerald-800/60 bg-emerald-950/30 p-4 text-sm text-emerald-100">
            <div className="font-medium">Copy this secret now. It will not be shown again.</div>
            <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-emerald-900/60 bg-black/20 px-3 py-2 font-mono text-xs">
              <span className="truncate">{createdSecret}</span>
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(createdSecret)}
                className="inline-flex items-center gap-1 rounded-full border border-emerald-800 px-2 py-1 text-emerald-100 hover:border-emerald-600"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy
              </button>
            </div>
          </div>
        ) : null}
        {error ? <div className="mt-3 text-sm text-rose-300">{error}</div> : null}
        <div className="mt-4 space-y-3">
          {tokens.map((token) => (
            <div
              key={token.id}
              className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-200"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="font-medium text-white">{token.name}</div>
                  <div className="mt-1 font-mono text-xs text-zinc-500">{token.maskedKey}</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {token.shareMode} · {token.scopes.join(", ")} · expires{" "}
                    {new Date(token.expiresAt).toLocaleString()}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void revokeToken(token.id)}
                  className="rounded-full border border-rose-800/70 px-3 py-1.5 text-xs text-rose-200 hover:border-rose-600 hover:text-white"
                >
                  Revoke
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Users className="h-4 w-4 text-sky-300" />
          Focus: Time Sharing Groups
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input
            value={groupName}
            onChange={(event) => setGroupName(event.target.value)}
            placeholder="Group name"
            className="rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-500"
          />
          <input
            value={groupDescription}
            onChange={(event) => setGroupDescription(event.target.value)}
            placeholder="Description"
            className="rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-500"
          />
        </div>
        <select
          multiple
          value={groupMemberIds}
          onChange={(event) =>
            setGroupMemberIds(Array.from(event.target.selectedOptions).map((option) => option.value))
          }
          className="mt-3 min-h-[140px] w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-500"
        >
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name || `${user.firstName} ${user.lastName}`.trim() || user.email}
            </option>
          ))}
        </select>
        <div className="mt-4">
          <button
            type="button"
            onClick={() => void createGroup()}
            className="inline-flex items-center gap-2 rounded-full bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
          >
            <Plus className="h-4 w-4" />
            Create Group
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {groups.map((group) => (
            <div
              key={group.id}
              className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-200"
            >
              <div className="font-medium text-white">{group.name}</div>
              <div className="mt-1 text-xs text-zinc-500">
                {group.memberIds.length} members
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
