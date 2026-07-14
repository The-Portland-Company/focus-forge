"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, ShieldCheck, KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Mode = "loading" | "enroll" | "challenge" | "done";

function MfaContent() {
  const searchParams = useSearchParams();
  const supabase = useRef(createClient()).current;

  const [mode, setMode] = useState<Mode>("loading");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);

  const redirectAfterSuccess = useCallback(() => {
    const from = searchParams.get("from") || "/today";
    // Hard navigation so the freshly-elevated (aal2) session cookie is sent to
    // the middleware on the next request.
    window.location.assign(from);
  }, [searchParams]);

  // Decide enroll vs challenge on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: aalData } =
          await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aalData?.currentLevel === "aal2") {
          if (!cancelled) redirectAfterSuccess();
          return;
        }

        const { data: factorsData, error: factorsError } =
          await supabase.auth.mfa.listFactors();
        if (factorsError) throw factorsError;

        const totp = factorsData?.totp || [];
        const verified = totp.find((f) => f.status === "verified");

        if (verified) {
          if (cancelled) return;
          setFactorId(verified.id);
          setMode("challenge");
          return;
        }

        // No verified factor → first-time enrollment. Clear any half-finished
        // (unverified) factors first so enroll() doesn't collide.
        for (const f of totp.filter((x) => x.status === "unverified")) {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }

        const { data: enrollData, error: enrollError } =
          await supabase.auth.mfa.enroll({
            factorType: "totp",
            friendlyName: `Focus Forge (${new Date().toISOString().slice(0, 10)})`,
          });
        if (enrollError) throw enrollError;
        if (cancelled) return;
        setFactorId(enrollData.id);
        setQrCode(enrollData.totp.qr_code);
        setSecret(enrollData.totp.secret);
        setMode("enroll");
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not start two-factor setup. Try again.",
          );
          setMode("enroll");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, redirectAfterSuccess]);

  const handleVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!factorId) return;
    setBusy(true);
    setError("");
    try {
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: code.trim(),
      });
      if (verifyError) throw verifyError;
      setMode("done");
      redirectAfterSuccess();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "That code didn't match. Try the current 6-digit code.",
      );
      setBusy(false);
    }
  };

  const signOut = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    window.location.assign("/auth/login");
  };

  const isEnroll = mode === "enroll";

  return (
    <div className="w-full max-w-md">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900">
          <ShieldCheck className="h-6 w-6 text-[rgb(var(--theme-primary-rgb))]" />
        </div>
        <h1 className="mb-2 text-2xl font-bold text-white">
          {isEnroll ? "Set up two-factor authentication" : "Two-factor authentication"}
        </h1>
        <p className="text-sm text-zinc-400">
          {isEnroll
            ? "Two-factor is now required. Add Focus Forge to an authenticator app, then enter the 6-digit code to finish."
            : "Enter the 6-digit code from your authenticator app to continue."}
        </p>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-8">
        {mode === "loading" ? (
          <div className="flex flex-col items-center gap-3 py-6 text-zinc-400">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-sm">Preparing…</span>
          </div>
        ) : (
          <form onSubmit={handleVerify} className="space-y-5">
            {isEnroll && qrCode ? (
              <div className="flex flex-col items-center gap-3">
                <div className="rounded-lg bg-white p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrCode}
                    alt="Authenticator QR code"
                    className="h-44 w-44"
                  />
                </div>
                {secret ? (
                  <div className="w-full text-center">
                    <p className="mb-1 text-xs text-zinc-500">
                      Or enter this key manually
                    </p>
                    <code className="inline-block break-all rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs tracking-wide text-zinc-300">
                      {secret}
                    </code>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div>
              <label
                htmlFor="mfa-code"
                className="mb-2 block text-sm font-medium text-zinc-200"
              >
                6-digit code
              </label>
              <input
                id="mfa-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-center text-lg tracking-[0.5em] text-white placeholder-zinc-600 focus:border-theme-primary focus:outline-none"
                placeholder="000000"
                required
                autoFocus
              />
            </div>

            {error ? (
              <div className="rounded-lg border border-red-800 bg-red-900/20 p-3 text-sm text-red-400">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-theme-primary px-4 py-2 text-white transition-colors hover:bg-theme-primary/80 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verifying…
                </>
              ) : (
                <>
                  <KeyRound className="h-4 w-4" />
                  {isEnroll ? "Verify & enable" : "Verify"}
                </>
              )}
            </button>
          </form>
        )}
      </div>

      <div className="mt-6 text-center">
        <button
          type="button"
          onClick={signOut}
          className="text-sm text-zinc-400 transition-colors hover:text-zinc-200"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

export default function MfaPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <Suspense
        fallback={
          <div className="flex items-center gap-2 text-zinc-400">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading…
          </div>
        }
      >
        <MfaContent />
      </Suspense>
    </div>
  );
}
