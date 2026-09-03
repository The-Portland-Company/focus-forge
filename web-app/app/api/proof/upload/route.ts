import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { uploadToOrgStorage } from "@/lib/media-storage/upload";
import { v4 as uuidv4 } from "uuid";

/**
 * Proof-media upload. A captured screenshot / screen recording (e.g. from the
 * DevNotes overlay) is uploaded to the organization's OWN Snap Shoot Share
 * storage account when one is configured; otherwise it falls back to the
 * default Supabase `task-attachments` bucket. Returns a `{ name, url }`
 * attachment record the caller can pin onto a Forge task.
 *
 * Authorization: the caller must be a member of the organization.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();
    if (authError || !session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const organizationId = formData.get("organizationId") as string | null;
    const taskId = formData.get("taskId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!organizationId) {
      return NextResponse.json(
        { error: "organizationId is required" },
        { status: 400 },
      );
    }

    // Membership check: only members of the org may store media in its account.
    const { data: membership } = await supabase
      .from("user_organizations")
      .select("organization_id")
      .eq("user_id", userId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Prefer the org's own storage account.
    const admin = getAdminClient();
    const { data: org } = await admin
      .from("organizations")
      .select("media_storage")
      .eq("id", organizationId)
      .maybeSingle();

    let attachment: {
      name: string;
      url: string;
      type: string;
      size_bytes: number;
      mime_type: string;
      storage_provider: string;
    } | null = null;

    try {
      const remote = await uploadToOrgStorage(
        (org as { media_storage?: unknown } | null)?.media_storage,
        { bytes: buffer, name: file.name, mime: file.type },
      );
      if (remote) {
        attachment = {
          name: file.name,
          url: remote.url,
          type: file.name.split(".").pop() || "unknown",
          size_bytes: file.size,
          mime_type: file.type,
          storage_provider: remote.provider,
        };
      }
    } catch (err) {
      console.error("Proof upload to org storage failed:", err);
      return NextResponse.json(
        {
          error:
            "Upload to the organization's storage account failed. Check the account token in organization settings.",
        },
        { status: 502 },
      );
    }

    // Fallback: default Supabase bucket (org has no storage account configured).
    if (!attachment) {
      const fileId = uuidv4();
      const storagePath = `${userId}/${fileId}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("task-attachments")
        .upload(storagePath, buffer, {
          contentType: file.type,
          upsert: false,
        });
      if (uploadError) {
        console.error("Supabase fallback upload error:", uploadError);
        return NextResponse.json(
          { error: "Failed to upload file", details: uploadError.message },
          { status: 500 },
        );
      }
      attachment = {
        name: file.name,
        url: storagePath,
        type: file.name.split(".").pop() || "unknown",
        size_bytes: file.size,
        mime_type: file.type,
        storage_provider: "supabase",
      };
    }

    // Optionally pin to a task's attachments row.
    if (taskId) {
      const { data: row, error: dbError } = await supabase
        .from("attachments")
        .insert({ ...attachment, task_id: taskId })
        .select()
        .single();
      if (dbError) {
        console.error("Proof attachment DB insert error:", dbError);
        return NextResponse.json(
          {
            error: "File uploaded but failed to save record",
            details: dbError.message,
            attachment,
          },
          { status: 500 },
        );
      }
      return NextResponse.json(row);
    }

    return NextResponse.json(attachment);
  } catch (error) {
    console.error("POST /api/proof/upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload proof media" },
      { status: 500 },
    );
  }
}
