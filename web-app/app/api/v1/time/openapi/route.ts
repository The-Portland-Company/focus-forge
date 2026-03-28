import { NextResponse } from "next/server";
import { getFocusTimeOpenApiUrl, FOCUS_TIME_OPENAPI_YAML } from "@/lib/time/openapi";
import { resolveBaseUrl } from "@/lib/time/utils";

export async function GET() {
  const baseUrl = resolveBaseUrl();

  return NextResponse.json({
    title: "Focus: Time OpenAPI Contract",
    contentType: "application/yaml",
    url: getFocusTimeOpenApiUrl(baseUrl),
    content: FOCUS_TIME_OPENAPI_YAML,
  });
}
