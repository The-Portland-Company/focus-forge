import type { FastifyRequest } from "fastify";
import { createClient } from "@supabase/supabase-js";

type AuthResult =
  | { ok: true; userId: string }
  | { ok: false; code: string; message: string };

const getBearer = (authHeader: string | undefined) => {
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") return null;
  return token;
};

export async function verifyBearer(request: FastifyRequest): Promise<AuthResult> {
  const token = getBearer(request.headers.authorization);
  if (!token) {
    return {
      ok: false,
      code: "missing_bearer_token",
      message: "Authorization header with Bearer token is required",
    };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return {
      ok: false,
      code: "missing_supabase_env",
      message: "Supabase URL/anon key are required",
    };
  }

  const supabase = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return {
      ok: false,
      code: "invalid_access_token",
      message: error?.message || "Access token is invalid or expired",
    };
  }

  return { ok: true, userId: data.user.id };
}

