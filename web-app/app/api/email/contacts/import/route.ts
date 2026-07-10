import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { importPersonalContacts, type ContactInput } from "@/lib/email-inbox/contacts";
import { parseContactsFile } from "@/lib/email-inbox/contact-import";

// Universal contact import: accepts either a multipart file upload (.vcf / .csv) or a JSON
// body { contacts: ContactInput[], source }. Imports into the user's personal contacts.
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;
  try {
    const contentType = request.headers.get("content-type") || "";
    let contacts: ContactInput[] = [];
    let source = "import";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }
      const text = await file.text();
      contacts = parseContactsFile(file.name, text);
      source = (form.get("source") as string) || (file.name.toLowerCase().endsWith(".vcf") ? "apple" : "import");
    } else {
      const body = await request.json();
      if (!Array.isArray(body?.contacts)) {
        return NextResponse.json(
          { error: "Body must include a contacts array" },
          { status: 400 },
        );
      }
      contacts = body.contacts as ContactInput[];
      source = typeof body.source === "string" ? body.source : "import";
    }

    if (contacts.length === 0) {
      return NextResponse.json(
        { error: "No valid contacts found in the provided data" },
        { status: 400 },
      );
    }

    const result = await importPersonalContacts({
      userId: auth.user.id,
      contacts,
      source,
    });
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to import contacts" },
      { status: 500 },
    );
  }
}
