import { NextResponse } from "next/server";
import { getFocusEmailOpenApiUrl, FOCUS_EMAIL_OPENAPI_YAML } from "@/lib/api/openapi/email";
import { resolveBaseUrl } from "@/lib/time/utils";

export async function GET() {
  const baseUrl = resolveBaseUrl();

  return NextResponse.json({
    title: "Focus: Email OpenAPI Contract",
    contentType: "application/yaml",
    url: getFocusEmailOpenApiUrl(baseUrl),
    content: FOCUS_EMAIL_OPENAPI_YAML,
  });
}
