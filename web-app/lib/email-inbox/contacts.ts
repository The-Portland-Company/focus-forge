import { getAdminClient } from "@/lib/supabase/admin";

export type ContactScope = "all" | "personal" | "org";

export interface ContactInput {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  phone?: string | null;
  source?: string;
}

export interface ContactRow {
  id: string;
  organization_id: string | null;
  user_id: string | null;
  profile_id: string | null;
  email: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  source: string;
  created_at: string;
  updated_at: string;
}

const CONTACT_COLUMNS =
  "id,organization_id,user_id,profile_id,email,display_name,first_name,last_name,phone,source,created_at,updated_at";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function deriveDisplayName(input: ContactInput): string | null {
  if (input.displayName && input.displayName.trim()) {
    return input.displayName.trim();
  }
  const full = `${input.firstName || ""} ${input.lastName || ""}`.trim();
  return full || null;
}

export async function getUserOrganizationIds(userId: string): Promise<string[]> {
  const admin = getAdminClient();
  const { data } = await admin
    .from("user_organizations")
    .select("organization_id")
    .eq("user_id", userId);
  return (data || [])
    .map((row: any) => row.organization_id)
    .filter((id: unknown): id is string => typeof id === "string");
}

/**
 * List contacts visible to a user: their personal contacts (user_id = userId) and,
 * when scope allows, org-shared contacts (organization_id in the user's orgs, user_id null).
 */
export async function listContacts(params: {
  userId: string;
  query?: string | null;
  scope?: ContactScope;
  limit?: number;
  offset?: number;
}): Promise<{ contacts: ContactRow[]; total: number }> {
  const admin = getAdminClient();
  const scope: ContactScope = params.scope || "all";
  const limit = Math.min(Math.max(params.limit ?? 100, 1), 500);
  const offset = Math.max(params.offset ?? 0, 0);

  const orgIds = scope === "personal" ? [] : await getUserOrganizationIds(params.userId);

  let query = admin
    .from("contacts")
    .select(CONTACT_COLUMNS, { count: "exact" });

  // Scope filter
  if (scope === "personal") {
    query = query.eq("user_id", params.userId);
  } else if (scope === "org") {
    if (orgIds.length === 0) return { contacts: [], total: 0 };
    query = query.is("user_id", null).in("organization_id", orgIds);
  } else {
    // all: personal OR org-shared in the user's orgs
    const orgClause =
      orgIds.length > 0
        ? `and(user_id.is.null,organization_id.in.(${orgIds.join(",")}))`
        : null;
    const orExpr = orgClause
      ? `user_id.eq.${params.userId},${orgClause}`
      : `user_id.eq.${params.userId}`;
    query = query.or(orExpr);
  }

  // Text search filter
  const q = (params.query || "").trim();
  if (q) {
    const like = `%${q.replace(/[%,]/g, "")}%`;
    query = query.or(
      `email.ilike.${like},display_name.ilike.${like},first_name.ilike.${like},last_name.ilike.${like}`,
    );
  }

  query = query
    .order("display_name", { ascending: true, nullsFirst: false })
    .order("email", { ascending: true })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message || "Failed to list contacts");
  return { contacts: (data || []) as unknown as ContactRow[], total: count ?? 0 };
}

/** Create a personal contact owned by the user. Returns the existing row if the email already exists. */
export async function createPersonalContact(params: {
  userId: string;
  input: ContactInput;
}): Promise<ContactRow> {
  const admin = getAdminClient();
  const email = normalizeEmail(params.input.email);
  if (!email || !email.includes("@")) {
    throw new Error("A valid email address is required");
  }

  const { data: existing } = await admin
    .from("contacts")
    .select(CONTACT_COLUMNS)
    .eq("user_id", params.userId)
    .eq("email", email)
    .maybeSingle();
  if (existing) return existing as unknown as ContactRow;

  const { data, error } = await admin
    .from("contacts")
    .insert({
      user_id: params.userId,
      organization_id: null,
      email,
      display_name: deriveDisplayName(params.input),
      first_name: params.input.firstName ?? null,
      last_name: params.input.lastName ?? null,
      phone: params.input.phone ?? null,
      source: params.input.source || "manual",
    })
    .select(CONTACT_COLUMNS)
    .single();
  if (error) throw new Error(error.message || "Failed to create contact");
  return data as unknown as ContactRow;
}

/** Update a contact the user owns (personal). */
export async function updatePersonalContact(params: {
  userId: string;
  id: string;
  patch: Partial<ContactInput>;
}): Promise<ContactRow | null> {
  const admin = getAdminClient();
  const update: Record<string, unknown> = {};
  if (params.patch.email !== undefined) update.email = normalizeEmail(params.patch.email);
  if (params.patch.firstName !== undefined) update.first_name = params.patch.firstName;
  if (params.patch.lastName !== undefined) update.last_name = params.patch.lastName;
  if (params.patch.phone !== undefined) update.phone = params.patch.phone;
  if (
    params.patch.displayName !== undefined ||
    params.patch.firstName !== undefined ||
    params.patch.lastName !== undefined
  ) {
    update.display_name = deriveDisplayName({
      email: params.patch.email || "",
      displayName: params.patch.displayName,
      firstName: params.patch.firstName,
      lastName: params.patch.lastName,
    });
  }
  if (Object.keys(update).length === 0) {
    const { data } = await admin
      .from("contacts")
      .select(CONTACT_COLUMNS)
      .eq("id", params.id)
      .eq("user_id", params.userId)
      .maybeSingle();
    return (data as unknown as ContactRow) ?? null;
  }

  const { data, error } = await admin
    .from("contacts")
    .update(update)
    .eq("id", params.id)
    .eq("user_id", params.userId)
    .select(CONTACT_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message || "Failed to update contact");
  return (data as unknown as ContactRow) ?? null;
}

/** Delete a personal contact the user owns. */
export async function deletePersonalContact(params: {
  userId: string;
  id: string;
}): Promise<boolean> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("contacts")
    .delete()
    .eq("id", params.id)
    .eq("user_id", params.userId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message || "Failed to delete contact");
  return Boolean(data);
}

export interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  total: number;
}

/**
 * Bulk import personal contacts for a user (Google People / vCard / CSV).
 * Upserts by (user_id, email): inserts new contacts, fills in missing names on existing ones.
 */
export async function importPersonalContacts(params: {
  userId: string;
  contacts: ContactInput[];
  source: string;
}): Promise<ImportResult> {
  const admin = getAdminClient();
  const result: ImportResult = { imported: 0, updated: 0, skipped: 0, total: 0 };

  // De-dupe + validate input
  const byEmail = new Map<string, ContactInput>();
  for (const c of params.contacts) {
    const email = normalizeEmail(c.email || "");
    if (!email || !email.includes("@")) {
      result.skipped += 1;
      continue;
    }
    const merged = byEmail.get(email) || { email };
    byEmail.set(email, {
      email,
      firstName: c.firstName ?? merged.firstName ?? null,
      lastName: c.lastName ?? merged.lastName ?? null,
      displayName: c.displayName ?? merged.displayName ?? null,
      phone: c.phone ?? merged.phone ?? null,
      source: params.source,
    });
  }
  result.total = byEmail.size + result.skipped;
  if (byEmail.size === 0) return result;

  const emails = Array.from(byEmail.keys());
  // Fetch existing personal contacts for these emails (chunked to keep the IN list sane)
  const existingByEmail = new Map<string, ContactRow>();
  const CHUNK = 200;
  for (let i = 0; i < emails.length; i += CHUNK) {
    const slice = emails.slice(i, i + CHUNK);
    const { data } = await admin
      .from("contacts")
      .select(CONTACT_COLUMNS)
      .eq("user_id", params.userId)
      .in("email", slice);
    for (const row of (data || []) as unknown as ContactRow[]) {
      existingByEmail.set(row.email, row);
    }
  }

  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: { id: string; patch: Record<string, unknown> }[] = [];

  for (const [email, input] of byEmail) {
    const existing = existingByEmail.get(email);
    if (!existing) {
      toInsert.push({
        user_id: params.userId,
        organization_id: null,
        email,
        display_name: deriveDisplayName(input),
        first_name: input.firstName ?? null,
        last_name: input.lastName ?? null,
        phone: input.phone ?? null,
        source: params.source,
      });
    } else {
      // Fill in only missing fields; don't clobber user edits.
      const patch: Record<string, unknown> = {};
      if (!existing.display_name && deriveDisplayName(input)) patch.display_name = deriveDisplayName(input);
      if (!existing.first_name && input.firstName) patch.first_name = input.firstName;
      if (!existing.last_name && input.lastName) patch.last_name = input.lastName;
      if (!existing.phone && input.phone) patch.phone = input.phone;
      if (Object.keys(patch).length > 0) {
        toUpdate.push({ id: existing.id, patch });
      } else {
        result.skipped += 1;
      }
    }
  }

  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const slice = toInsert.slice(i, i + CHUNK);
    const { error } = await admin.from("contacts").insert(slice);
    if (error) throw new Error(error.message || "Failed to import contacts");
    result.imported += slice.length;
  }
  for (const u of toUpdate) {
    const { error } = await admin.from("contacts").update(u.patch).eq("id", u.id).eq("user_id", params.userId);
    if (!error) result.updated += 1;
  }

  return result;
}

/**
 * Contact addresses for recipient suggestions: the user's personal contacts plus
 * org-shared contacts in their organizations. Returned as {email, name} for merging.
 */
export async function getContactAddressesForUser(
  userId: string,
): Promise<Array<{ email: string; name: string | null }>> {
  const admin = getAdminClient();
  const orgIds = await getUserOrganizationIds(userId);
  const orgClause =
    orgIds.length > 0
      ? `and(user_id.is.null,organization_id.in.(${orgIds.join(",")}))`
      : null;
  const orExpr = orgClause ? `user_id.eq.${userId},${orgClause}` : `user_id.eq.${userId}`;

  const { data } = await admin
    .from("contacts")
    .select("email,display_name")
    .or(orExpr)
    .limit(5000);
  return (data || []).map((row: any) => ({
    email: String(row.email || "").toLowerCase(),
    name: row.display_name || null,
  }));
}
