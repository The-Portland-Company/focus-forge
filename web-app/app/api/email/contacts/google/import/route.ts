import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import {
  fetchGoogleContacts,
  markGoogleSynced,
  isGoogleConfigured,
} from "@/lib/email-inbox/google-contacts";
import { importPersonalContacts } from "@/lib/email-inbox/contacts";

// Pulls the connected Google account's contacts via People API and imports them.
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;
  if (!isGoogleConfigured()) {
    return NextResponse.json(
      { error: "Google contact import is not configured.", configured: false },
      { status: 501 },
    );
  }
  try {
    const contacts = await fetchGoogleContacts(auth.user.id);
    const result = await importPersonalContacts({
      userId: auth.user.id,
      contacts,
      source: "google",
    });
    await markGoogleSynced(auth.user.id);
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to import Google contacts" },
      { status: 500 },
    );
  }
}
