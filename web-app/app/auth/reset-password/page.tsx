'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, KeyRound, Loader2, Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type ResetState = 'loading' | 'ready' | 'success' | 'error'

// Resolve to `null` if the promise does not settle in time, so a hung
// supabase-js auth lock can never freeze the recovery UI.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ])
}

export default function ResetPasswordPage() {
  const router = useRouter()
  const [state, setState] = useState<ResetState>('loading')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  // Recovery tokens captured from the URL, used to update the password via a
  // direct GoTrue REST call (which avoids the client-side session machinery).
  const tokensRef = useRef<{ accessToken: string; refreshToken: string | null } | null>(null)

  useEffect(() => {
    let cancelled = false

    const fail = (msg: string) => {
      if (cancelled) return
      setState('error')
      setMessage(msg)
    }

    // Recovery links arrive in one of three shapes:
    //  1. Implicit flow -> #access_token=...&refresh_token=...&type=recovery
    //  2. PKCE flow      -> ?code=...
    //  3. Error          -> #error=...&error_description=...
    //
    // We deliberately do NOT rely on detectSessionInUrl / the supabase client
    // to establish the session here: with the SSR cookie client and multiple
    // client instances on the page, the navigator.locks auth lock can deadlock
    // and leave the page stuck on "Preparing Reset". Instead we read the tokens
    // directly and update the password against GoTrue's REST API on submit.
    const init = async () => {
      const hash = typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : ''
      const hashParams = new URLSearchParams(hash)
      const queryParams = new URLSearchParams(
        typeof window !== 'undefined' ? window.location.search : ''
      )

      const hashError = hashParams.get('error_description') || hashParams.get('error')
      if (hashError) {
        fail(decodeURIComponent(hashError.replace(/\+/g, ' ')))
        return
      }

      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')
      const code = queryParams.get('code')

      const stripUrl = () => {
        if (typeof window !== 'undefined') {
          window.history.replaceState(null, '', window.location.pathname)
        }
      }

      if (accessToken) {
        tokensRef.current = { accessToken, refreshToken }
        if (!cancelled) setState('ready')
        stripUrl()
        return
      }

      // PKCE fallback: exchange the code for a session, guarded by a timeout so
      // a stuck auth lock can't hang the page.
      if (code) {
        const supabase = createClient()
        const result = await withTimeout(supabase.auth.exchangeCodeForSession(code), 6000)
        if (cancelled) return
        const session = result?.data?.session
        if (session?.access_token) {
          tokensRef.current = {
            accessToken: session.access_token,
            refreshToken: session.refresh_token ?? null,
          }
          setState('ready')
          stripUrl()
        } else {
          fail('This reset link is invalid or has expired. Request a new password reset email.')
        }
        return
      }

      fail('This reset link is invalid or has expired. Request a new password reset email.')
    }

    void init()

    return () => {
      cancelled = true
    }
  }, [])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setMessage('')

    if (password.length < 8) {
      setState('error')
      setMessage('Please choose a password with at least 8 characters.')
      return
    }

    if (password !== confirmPassword) {
      setState('error')
      setMessage('Passwords do not match.')
      return
    }

    const tokens = tokensRef.current
    if (!tokens?.accessToken) {
      setState('error')
      setMessage('This reset link is invalid or has expired. Request a new password reset email.')
      return
    }

    setIsSubmitting(true)

    try {
      // Update the password directly against GoTrue using the recovery access
      // token as a bearer credential. This is what updateUser() does under the
      // hood, but without the client-side auth lock that can deadlock here.
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

      const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
          Authorization: `Bearer ${tokens.accessToken}`,
        },
        body: JSON.stringify({ password }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null)
        const reason =
          data?.msg ||
          data?.error_description ||
          data?.error ||
          (response.status === 401 || response.status === 403
            ? 'Your reset link has expired. Request a new password reset email.'
            : 'Failed to reset password. Please try again.')
        throw new Error(reason)
      }

      setState('success')
      setMessage('Your password has been updated. Redirecting to your workspace...')

      // Best-effort: establish a browser session so we can drop the user
      // straight into the app. Guarded by a timeout so a hung auth lock never
      // blocks the redirect; fall back to the login page if it doesn't settle.
      let loggedIn = false
      if (tokens.refreshToken) {
        try {
          const supabase = createClient()
          const result = await withTimeout(
            supabase.auth.setSession({
              access_token: tokens.accessToken,
              refresh_token: tokens.refreshToken,
            }),
            4000
          )
          loggedIn = Boolean(result && !result.error && result.data?.session)
        } catch {
          loggedIn = false
        }
      }

      window.setTimeout(
        () => router.push(loggedIn ? '/today' : '/auth/login?reset=success'),
        1200
      )
    } catch (error) {
      setState('error')
      setMessage(error instanceof Error ? error.message : 'Failed to reset password.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-zinc-900 rounded-lg p-8 border border-zinc-800">
          {state === 'loading' && (
            <div className="text-center">
              <div className="w-16 h-16 bg-theme-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Loader2 className="w-8 h-8 text-theme-primary animate-spin" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">Preparing Reset</h1>
              <p className="text-zinc-400">Verifying your recovery link...</p>
            </div>
          )}

          {state === 'ready' && (
            <>
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-theme-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <KeyRound className="w-8 h-8 text-theme-primary" />
                </div>
                <h1 className="text-2xl font-bold text-white mb-2">Set a new password</h1>
                <p className="text-zinc-400">Choose a new password for your account.</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="password" className="block text-sm font-medium mb-2 text-white">
                    New password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 py-2 pl-10 pr-3 text-white focus:border-theme-primary focus:outline-none"
                      autoComplete="new-password"
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="confirm-password"
                    className="block text-sm font-medium mb-2 text-white"
                  >
                    Confirm password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 py-2 pl-10 pr-3 text-white focus:border-theme-primary focus:outline-none"
                      autoComplete="new-password"
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full rounded-lg bg-theme-primary px-4 py-2 text-white transition-colors hover:bg-theme-primary/80 disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <KeyRound className="w-4 h-4" />
                      Update password
                    </>
                  )}
                </button>
              </form>
            </>
          )}

          {state === 'success' && (
            <div className="text-center">
              <div className="w-16 h-16 bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-green-400" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">Password updated</h1>
              <p className="text-zinc-400">{message}</p>
            </div>
          )}

          {state === 'error' && (
            <div className="text-center">
              <div className="w-16 h-16 bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <KeyRound className="w-8 h-8 text-red-400" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">Reset unavailable</h1>
              <p className="text-zinc-400 mb-6">{message}</p>
              <Link
                href="/auth/forgot-password"
                className="inline-flex items-center gap-2 text-theme-primary hover:underline"
              >
                <ArrowLeft className="w-4 h-4" />
                Request another reset email
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
