import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { processScheduledReplyDrafts } from "@/lib/email-inbox/server";

async function authorizeProcessor(request: NextRequest) {
  const cronKey = request.headers.get("x-focus-forge-cron-key");
  if (cronKey && process.env.JWT_SECRET && cronKey === process.env.JWT_SECRET) {
    return { authorized: true };
  }

  const auth = await requireAuth(request);
  if ("errorResponse" in auth) {
    return { authorized: false, errorResponse: auth.errorResponse };
  }

  return { authorized: true };
}

export async function POST(request: NextRequest) {
  const authorization = await authorizeProcessor(request);
  if (!authorization.authorized) {
    return authorization.errorResponse;
  }

  try {
    const result = await processScheduledReplyDrafts();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to process scheduled reply drafts",
      },
      { status: 500 },
    );
  }
}
