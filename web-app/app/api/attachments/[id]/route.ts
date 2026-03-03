import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const params = await props.params;
    const supabase = await createClient();

    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();
    if (authError || !session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch the attachment row to get the storage path
    const { data: attachment, error: fetchError } = await supabase
      .from("attachments")
      .select("*")
      .eq("id", params.id)
      .single();

    if (fetchError || !attachment) {
      return NextResponse.json(
        { error: "Attachment not found" },
        { status: 404 },
      );
    }

    // Remove from Supabase Storage if it's stored there
    if (attachment.storage_provider === "supabase" && attachment.url) {
      const { error: storageError } = await supabase.storage
        .from("task-attachments")
        .remove([attachment.url]);

      if (storageError) {
        console.error("Storage delete error:", storageError);
      }
    }

    // Delete the DB row
    const { error: deleteError } = await supabase
      .from("attachments")
      .delete()
      .eq("id", params.id);

    if (deleteError) {
      console.error("DB delete error:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete attachment", details: deleteError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/attachments/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete attachment" },
      { status: 500 },
    );
  }
}
