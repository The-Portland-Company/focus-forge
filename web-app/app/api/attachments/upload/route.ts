import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { v4 as uuidv4 } from "uuid";

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
    const taskId = formData.get("taskId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const fileId = uuidv4();
    const storagePath = `${userId}/${fileId}-${file.name}`;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from("task-attachments")
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload file", details: uploadError.message },
        { status: 500 },
      );
    }

    // Build the attachment metadata
    const attachmentBase = {
      name: file.name,
      url: storagePath,
      type: file.name.split(".").pop() || "unknown",
      size_bytes: file.size,
      mime_type: file.type,
      storage_provider: "supabase",
    };

    // If taskId provided, insert into attachments table
    if (taskId) {
      const { data: row, error: dbError } = await supabase
        .from("attachments")
        .insert({ ...attachmentBase, task_id: taskId })
        .select()
        .single();

      if (dbError) {
        console.error("DB insert error:", dbError);
        return NextResponse.json(
          { error: "File uploaded but failed to save record", details: dbError.message },
          { status: 500 },
        );
      }

      return NextResponse.json(row);
    }

    // No taskId — return metadata without DB insert (caller will handle it)
    return NextResponse.json({
      id: fileId,
      ...attachmentBase,
    });
  } catch (error) {
    console.error("POST /api/attachments/upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload attachment" },
      { status: 500 },
    );
  }
}
