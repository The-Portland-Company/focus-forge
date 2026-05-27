import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

// Speech-to-text providers in priority order. Both expose the OpenAI-compatible
// /audio/transcriptions endpoint. Groq (Whisper-large-v3) is preferred — it's
// fast/cheap and keeps voice working when the OpenAI account is out of quota;
// OpenAI Whisper is the fallback. (xAI/Anthropic offer no STT API.)
const STT_PROVIDERS = [
  {
    name: "groq",
    url: "https://api.groq.com/openai/v1/audio/transcriptions",
    model: "whisper-large-v3",
    apiKey: () => process.env.GROQ_API_KEY,
  },
  {
    name: "openai",
    url: "https://api.openai.com/v1/audio/transcriptions",
    model: "whisper-1",
    apiKey: () => process.env.OPENAI_API_KEY,
  },
];

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

    const configured = STT_PROVIDERS.filter((p) => p.apiKey());
    if (configured.length === 0) {
      return NextResponse.json(
        { error: "No speech-to-text provider configured (set GROQ_API_KEY or OPENAI_API_KEY)" },
        { status: 503 },
      );
    }

    const incoming = await request.formData();
    const audio = incoming.get("audio");
    if (!(audio instanceof Blob)) {
      return NextResponse.json({ error: "Missing audio field" }, { status: 400 });
    }
    const filename = (incoming.get("filename") as string | null) || "recording.webm";

    const errors: string[] = [];
    for (const provider of configured) {
      const upstream = new FormData();
      upstream.append("file", audio, filename);
      upstream.append("model", provider.model);
      upstream.append("response_format", "json");

      try {
        const resp = await fetch(provider.url, {
          method: "POST",
          headers: { Authorization: `Bearer ${provider.apiKey()}` },
          body: upstream,
        });
        if (!resp.ok) {
          errors.push(`${provider.name} ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
          continue; // fall through to the next provider
        }
        const payload = (await resp.json()) as { text?: string };
        return NextResponse.json({ text: payload.text ?? "", provider: provider.name });
      } catch (err) {
        errors.push(`${provider.name}: ${err instanceof Error ? err.message : "request failed"}`);
      }
    }

    return NextResponse.json(
      { error: `Transcription failed on all providers. ${errors.join(" | ")}` },
      { status: 502 },
    );
  } catch (err) {
    console.error("voice/transcribe error", err);
    return NextResponse.json({ error: "Failed to transcribe audio" }, { status: 500 });
  }
}
