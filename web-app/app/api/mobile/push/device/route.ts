import { NextRequest, NextResponse } from "next/server";
import {
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessToken,
} from "@/lib/mobile/api";
import { getAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyMobileAccessToken(
      request.headers.get("authorization"),
    );

    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status });
    }

    const body = await request.json();
    const platform = String(body?.platform || "").trim().toLowerCase();
    const deviceId = String(body?.device_id || "").trim().toLowerCase();
    const pushToken = String(body?.token || "").trim();
    const environment =
      String(body?.environment || "").trim().toLowerCase() === "sandbox"
        ? "sandbox"
        : "production";
    const bundleId = String(body?.bundle_id || "").trim();

    if (platform !== "ios") {
      return NextResponse.json(
        mobileFailure("validation_error", "Only iOS push registration is supported."),
        { status: 400 },
      );
    }

    if (!deviceId || !pushToken || !bundleId) {
      return NextResponse.json(
        mobileFailure(
          "validation_error",
          "device_id, token, and bundle_id are required.",
        ),
        { status: 400 },
      );
    }

    const admin = getAdminClient();
    const now = new Date().toISOString();

    await admin
      .from("mobile_push_devices")
      .update({
        is_active: false,
        last_error_at: null,
        last_error_message: null,
      })
      .eq("platform", "ios")
      .eq("push_token", pushToken)
      .neq("device_id", deviceId)
      .eq("is_active", true);

    const { data, error } = await admin
      .from("mobile_push_devices")
      .upsert(
        {
          user_id: auth.user.id,
          platform: "ios",
          device_id: deviceId,
          push_token: pushToken,
          environment,
          bundle_id: bundleId,
          device_name:
            typeof body?.device_name === "string" ? body.device_name.trim() : null,
          app_version:
            typeof body?.app_version === "string" ? body.app_version.trim() : null,
          build_number:
            typeof body?.build_number === "string" ? body.build_number.trim() : null,
          locale: typeof body?.locale === "string" ? body.locale.trim() : null,
          time_zone:
            typeof body?.time_zone === "string" ? body.time_zone.trim() : null,
          is_active: true,
          last_registered_at: now,
          last_seen_at: now,
          last_error_at: null,
          last_error_message: null,
        },
        {
          onConflict: "platform,device_id",
        },
      )
      .select("id,device_id")
      .single();

    if (error) {
      return NextResponse.json(
        mobileFailure("registration_failed", error.message, error),
        { status: 500 },
      );
    }

    return NextResponse.json(
      mobileSuccess({
        registered: true,
        device_id: data?.device_id ?? deviceId,
        row_id: data?.id ?? null,
      }),
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      mobileFailure(
        "internal_error",
        "Failed to register the mobile push device.",
        error,
      ),
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await verifyMobileAccessToken(
      request.headers.get("authorization"),
    );

    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status });
    }

    const body = await request.json().catch(() => ({}));
    const deviceId = String(body?.device_id || "").trim().toLowerCase();

    if (!deviceId) {
      return NextResponse.json(
        mobileFailure("validation_error", "device_id is required."),
        { status: 400 },
      );
    }

    const admin = getAdminClient();
    const { error } = await admin
      .from("mobile_push_devices")
      .update({
        is_active: false,
        last_error_at: null,
        last_error_message: null,
      })
      .eq("user_id", auth.user.id)
      .eq("platform", "ios")
      .eq("device_id", deviceId);

    if (error) {
      return NextResponse.json(
        mobileFailure("deactivation_failed", error.message, error),
        { status: 500 },
      );
    }

    return NextResponse.json(mobileSuccess({ deactivated: true }), {
      status: 200,
    });
  } catch (error) {
    return NextResponse.json(
      mobileFailure(
        "internal_error",
        "Failed to deactivate the mobile push device.",
        error,
      ),
      { status: 500 },
    );
  }
}
