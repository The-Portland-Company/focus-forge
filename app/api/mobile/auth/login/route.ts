import { NextRequest, NextResponse } from "next/server";
import { createAnonSupabase, mobileFailure, mobileSuccess } from "@/lib/mobile/api";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");

    if (!email || !password) {
      return NextResponse.json(
        mobileFailure("missing_credentials", "email and password are required"),
        { status: 400 },
      );
    }

    const supabase = createAnonSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data?.session || !data?.user) {
      return NextResponse.json(
        mobileFailure(
          "login_failed",
          error?.message || "Invalid email or password",
          error,
        ),
        { status: 401 },
      );
    }

    return NextResponse.json(
      mobileSuccess({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        token_type: data.session.token_type,
        expires_in: data.session.expires_in,
        expires_at: data.session.expires_at,
        user: data.user,
      }),
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      mobileFailure("internal_error", "Failed to login", error),
      { status: 500 },
    );
  }
}
