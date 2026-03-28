import { NextResponse } from "next/server";
import { FOCUS_TIME_PROMPT_MARKDOWN, getFocusTimePromptUrl } from "@/lib/time/prompt";
import { resolveBaseUrl } from "@/lib/time/utils";

export async function GET() {
  const baseUrl = resolveBaseUrl();

  return NextResponse.json({
    title: "Focus: Time Implementation Prompt",
    contentType: "text/markdown",
    url: getFocusTimePromptUrl(baseUrl),
    content: FOCUS_TIME_PROMPT_MARKDOWN,
  });
}
