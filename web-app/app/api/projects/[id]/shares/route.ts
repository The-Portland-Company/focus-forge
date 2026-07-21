import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  generateShareToken,
  hashPasscode,
  normalizePermission,
} from "@/lib/project-share";

// Shape returned to the client. NEVER includes passcode_hash.
function toClientShare(row: any) {
  return {
    id: row.id,
    project_id: row.project_id,
    token: row.token,
    allow_public: row.allow_public,
    permission: row.permission === "write" ? "write" : "read",
    expires_at: row.expires_at,
    created_at: row.created_at,
    revoked_at: row.revoked_at,
    has_passcode: Boolean(row.passcode_hash),
  };
}

// GET: list active (non-revoked) shares for a project.
export async function GET(
  _request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const { id: projectId } = await props.params;
    const supabase = await createClient();
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();
    if (authError || !session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // RLS (project_shares_member_all) scopes visibility to project members.
    const { data, error } = await supabase
      .from("project_shares")
      .select("*")
      .eq("project_id", projectId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json({ shares: (data || []).map(toClientShare) });
  } catch (error) {
    console.error("Failed to list project shares:", error);
    return NextResponse.json(
      { error: "Failed to list shares" },
      { status: 500 },
    );
  }
}

// POST: create a new share link.
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const { id: projectId } = await props.params;
    const supabase = await createClient();
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();
    if (authError || !session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const passcode =
      typeof body?.passcode === "string" && body.passcode.trim().length > 0
        ? body.passcode.trim()
        : null;
    const expiresAt =
      typeof body?.expires_at === "string" && body.expires_at.trim().length > 0
        ? new Date(body.expires_at).toISOString()
        : null;
    const allowPublic = body?.allow_public === false ? false : true;

    const insertRow = {
      project_id: projectId,
      token: generateShareToken(),
      passcode_hash: passcode ? hashPasscode(passcode) : null,
      expires_at: expiresAt,
      allow_public: allowPublic,
      // Anything but an explicit "write" is stored as read-only.
      permission: normalizePermission(body?.permission),
      created_by: session.user.id,
    };

    // RLS enforces that only project members may insert for this project.
    const { data, error } = await supabase
      .from("project_shares")
      .insert(insertRow)
      .select("*")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Not allowed to share this project" },
        { status: 403 },
      );
    }

    return NextResponse.json({ share: toClientShare(data) });
  } catch (error) {
    console.error("Failed to create project share:", error);
    return NextResponse.json(
      { error: "Failed to create share" },
      { status: 500 },
    );
  }
}
