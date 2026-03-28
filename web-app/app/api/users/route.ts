import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getAdminClient } from "@/lib/supabase/admin";
import { sendPasswordResetEmail } from "@/lib/email";
import { requireAdminSessionOrPatAdminScope } from "@/lib/api/keys/auth";

type UserRole = "team_member" | "admin" | "super_admin";

const ALLOWED_ROLES: UserRole[] = ["team_member", "admin", "super_admin"];
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const errorResponse = (status: number, code: string, message: string) =>
  NextResponse.json({ error: { code, message } }, { status });

const generateSecurePassword = () => `${randomBytes(32).toString("base64url")}Aa1!`;
const DUPLICATE_USER_ERROR = /already.*registered|already.*exists|duplicate/i;

const findAuthUserByEmail = async (email: string) => {
  const admin = getAdminClient();
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      return null;
    }

    const users = data?.users || [];
    const match = users.find(
      (user: any) => (user.email || "").trim().toLowerCase() === email,
    );
    if (match) {
      return match;
    }

    if (users.length < perPage) {
      return null;
    }
    page += 1;
  }
};

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminSessionOrPatAdminScope(request);
    if (auth.errorResponse || !auth.principal) {
      return auth.errorResponse ?? errorResponse(401, "unauthorized", "Unauthorized");
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return errorResponse(400, "invalid_json", "Request body must be valid JSON.");
    }

    const email = String(body?.email || "").trim().toLowerCase();
    const clientProvidedPassword = typeof body?.password === "string";
    const firstName = String(body?.firstName || "").trim();
    const lastName = String(body?.lastName || "").trim();
    const organizationId =
      typeof body?.organizationId === "string" ? body.organizationId.trim() : "";
    const bypassEmailConfirmation =
      typeof body?.bypassEmailConfirmation === "boolean"
        ? body.bypassEmailConfirmation
        : false;
    const sendPasswordReset =
      typeof body?.sendPasswordReset === "boolean" ? body.sendPasswordReset : true;
    const hasRoleInput = body?.role !== undefined;
    const roleCandidate = String(body?.role || "team_member").trim() as UserRole;
    const role: UserRole = ALLOWED_ROLES.includes(roleCandidate)
      ? roleCandidate
      : "team_member";

    if (!email || !email.includes("@")) {
      return errorResponse(400, "invalid_email", "A valid email is required.");
    }
    if (clientProvidedPassword) {
      return errorResponse(
        400,
        "password_not_allowed",
        "Password must not be provided. Passwords are generated server-side.",
      );
    }
    if (hasRoleInput && !ALLOWED_ROLES.includes(roleCandidate)) {
      return errorResponse(
        400,
        "invalid_role",
        "Invalid role. Allowed roles: team_member, admin, super_admin.",
      );
    }
    if (organizationId && !UUID_REGEX.test(organizationId)) {
      return errorResponse(
        400,
        "invalid_organization_id",
        "organizationId must be a valid UUID.",
      );
    }
    if (
      auth.principal.type === "pat" &&
      (roleCandidate === "admin" || roleCandidate === "super_admin")
    ) {
      return errorResponse(
        403,
        "forbidden_role_assignment",
        "PAT-authenticated requests cannot assign admin or super_admin roles.",
      );
    }

    const generatedPassword = generateSecurePassword();

    const admin = getAdminClient();
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: generatedPassword,
      email_confirm: bypassEmailConfirmation,
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        display_name: `${firstName} ${lastName}`.trim(),
      },
    });

    if (createError || !created?.user) {
      const duplicateMessage = createError?.message || "";
      if (DUPLICATE_USER_ERROR.test(duplicateMessage)) {
        const existingUser = await findAuthUserByEmail(email);
        if (!existingUser?.id) {
          return errorResponse(
            409,
            "user_already_exists",
            "User already exists, but lookup by email failed.",
          );
        }

        const { data: existingProfile } = await admin
          .from("profiles")
          .select("role")
          .eq("id", existingUser.id)
          .maybeSingle();

        if (organizationId) {
          await admin.from("user_organizations").upsert(
            {
              user_id: existingUser.id,
              organization_id: organizationId,
              is_owner: false,
            },
            { onConflict: "user_id,organization_id" },
          );
        }

        return NextResponse.json(
          {
            user: {
              id: existingUser.id,
              email: existingUser.email || email,
              role: (existingProfile?.role as UserRole) || "team_member",
              emailConfirmedAt: existingUser.email_confirmed_at,
              organizationId: organizationId || null,
            },
            alreadyExists: true,
            passwordResetEmailSent: false,
          },
          { status: 200 },
        );
      }

      return errorResponse(
        400,
        "create_user_failed",
        duplicateMessage || "Failed to create user.",
      );
    }

    const userId = created.user.id;

    await admin.from("profiles").upsert(
      {
        id: userId,
        email,
        first_name: firstName || null,
        last_name: lastName || null,
        role,
      },
      { onConflict: "id" },
    );

    if (organizationId) {
      await admin.from("user_organizations").upsert(
        {
          user_id: userId,
          organization_id: organizationId,
          is_owner: false,
        },
        { onConflict: "user_id,organization_id" },
      );
    }

    let passwordResetEmailSent = false;
    if (sendPasswordReset) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3244";
      const redirectTo = `${appUrl}/auth/reset-password`;

      const { data: recoveryData, error: recoveryError } =
        await admin.auth.admin.generateLink({
          type: "recovery",
          email,
          options: { redirectTo },
        });

      if (!recoveryError && recoveryData?.properties?.action_link) {
        await sendPasswordResetEmail({
          to: email,
          firstName,
          resetUrl: recoveryData.properties.action_link,
        });
        passwordResetEmailSent = true;
      } else {
        console.error("Failed to generate password recovery link", recoveryError);
      }
    }

    return NextResponse.json(
      {
        user: {
          id: userId,
          email: created.user.email,
          role,
          emailConfirmedAt: created.user.email_confirmed_at,
          organizationId: organizationId || null,
        },
        passwordResetEmailSent,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating user:", error);
    return errorResponse(500, "internal_error", "Failed to create user.");
  }
}
