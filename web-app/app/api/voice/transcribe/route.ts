import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getConfiguredSttProviders,
  normalizeSttPreference,
  transcribeWithFallback,
} from "@/lib/voice/stt";

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

    if (getConfiguredSttProviders().length === 0) {
      return NextResponse.json(
        { error: "No speech-to-text provider configured (set GROQ_API_KEY or OPENAI_API_KEY)" },
        { status: 503 },
      );
    }

    const incoming = await request.formData();
    const audio = incoming.get("audio");
    if (!(audio instanceof Blob) || audio.size === 0) {
      return NextResponse.json({ error: "Missing or empty audio field" }, { status: 400 });
    }
    const filename = (incoming.get("filename") as string | null) || "recording.webm";

    // Optional client-requested provider (FormData field or ?provider= query).
    const preference = normalizeSttPreference(
      incoming.get("provider") ?? request.nextUrl.searchParams.get("provider"),
    );

    try {
      const { text, provider } = await transcribeWithFallback({ audio, filename, preference });
      return NextResponse.json({ text, provider });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Transcription failed";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  } catch (err) {
    console.error("voice/transcribe error", err);
    return NextResponse.json({ error: "Failed to transcribe audio" }, { status: 500 });
  }
}
