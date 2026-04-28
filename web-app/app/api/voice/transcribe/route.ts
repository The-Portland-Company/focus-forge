import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

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

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured" },
        { status: 500 },
      );
    }

    const incoming = await request.formData();
    const audio = incoming.get("audio");
    if (!(audio instanceof Blob)) {
      return NextResponse.json(
        { error: "Missing audio field" },
        { status: 400 },
      );
    }

    const filename =
      (incoming.get("filename") as string | null) || "recording.webm";

    const upstream = new FormData();
    upstream.append("file", audio, filename);
    upstream.append("model", "whisper-1");
    upstream.append("response_format", "json");

    const resp = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: upstream,
      },
    );

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json(
        { error: `Transcription failed: ${text}` },
        { status: 502 },
      );
    }

    const payload = (await resp.json()) as { text?: string };
    return NextResponse.json({ text: payload.text ?? "" });
  } catch (err) {
    console.error("voice/transcribe error", err);
    return NextResponse.json(
      { error: "Failed to transcribe audio" },
      { status: 500 },
    );
  }
}
