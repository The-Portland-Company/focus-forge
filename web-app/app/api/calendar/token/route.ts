import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { randomBytes } from "crypto";

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export async function GET() {
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

    // Fetch existing token (cast to bypass generated types lag)
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("calendar_feed_token" as any)
      .eq("id", userId)
      .single();

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch profile" },
        { status: 500 },
      );
    }

    let token = (profile as any)?.calendar_feed_token as string | null;

    // Generate one if none exists
    if (!token) {
      token = generateToken();
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ calendar_feed_token: token } as any)
        .eq("id", userId);

      if (updateError) {
        return NextResponse.json(
          { error: "Failed to generate token" },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ token });
  } catch (error) {
    console.error("GET /api/calendar/token error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST() {
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
    const newToken = generateToken();

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ calendar_feed_token: newToken } as any)
      .eq("id", userId);

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to regenerate token" },
        { status: 500 },
      );
    }

    return NextResponse.json({ token: newToken });
  } catch (error) {
    console.error("POST /api/calendar/token error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
