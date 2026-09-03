'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, LogIn } from 'lucide-react'
import Link from 'next/link'

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  
  useEffect(() => {
    // Check if user just registered
    if (searchParams.get('registered') === 'true') {
      setMessage('Registration successful! Please log in.')
    }
    const invitedEmail = searchParams.get('email')
    if (invitedEmail) {
      setEmail(invitedEmail)
    }
    const loginMessage = searchParams.get('message')
    if (loginMessage) {
      setMessage(loginMessage)
    }
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const controller = new AbortController()
      const timeoutId = window.setTimeout(() => controller.abort(), 25_000)

      let response: Response
      try {
        response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
          signal: controller.signal,
        })
      } finally {
        window.clearTimeout(timeoutId)
      }

      const raw = await response.text()
      let data: { error?: string; success?: boolean } = {}
      try {
        data = raw ? (JSON.parse(raw) as { error?: string; success?: boolean }) : {}
      } catch {
        throw new Error(
          raw?.trim()
            ? `Login failed (${response.status}): ${raw.slice(0, 160)}`
            : `Login failed (${response.status}): empty response from server`,
        )
      }

      if (!response.ok) {
        const msg =
          typeof data.error === 'string' && data.error.trim()
            ? data.error
            : `Login failed (${response.status})`
        throw new Error(msg)
      }

      if (!data.success) {
        throw new Error('Login failed: unexpected server response')
      }

      // Redirect to the original page or home
      const from = searchParams.get('from') || '/today'
      router.push(from)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError(
          'Sign-in timed out. Database API may be recovering — wait a minute and try again.',
        )
      } else {
        setError(err instanceof Error ? err.message : 'Login failed')
      }
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md w-full">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Welcome back</h1>
        <p className="text-zinc-400">Sign in to your account</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-zinc-900 rounded-lg p-8 border border-zinc-800">
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-2">
                Email
              </label>
              <input
                id="email"
                name="username"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:border-theme-primary focus:outline-none"
                placeholder="you@example.com"
                required
                autoComplete="username"
              />
            </div>

            {/* Relative wrapper so the "Forgot password?" link can float to the
                top-right where it visually belongs while coming AFTER the
                password input in the DOM. Previously the link sat before the
                input, so Tab from Email jumped to it instead of the password
                field. Order is now Email → Password → Forgot password → Sign
                in. */}
            <div className="relative">
              <label
                htmlFor="password"
                className="block text-sm font-medium mb-2"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:border-theme-primary focus:outline-none"
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
              <Link
                href="/auth/forgot-password"
                className="absolute top-0 right-0 text-sm text-[rgb(var(--theme-primary-rgb))] hover:underline"
              >
                Forgot password?
              </Link>
            </div>
          </div>

          {message && (
            <div className="mt-4 p-3 bg-green-900/20 border border-green-800 rounded-lg text-green-400 text-sm">
              {message}
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 bg-red-900/20 border border-red-800 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-6 px-4 py-2 bg-theme-primary text-white rounded-lg hover:bg-theme-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Signing in...
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                Sign in
              </>
            )}
          </button>
        </div>
      </form>

      <div className="mt-6 text-center">
        <p className="text-sm text-zinc-400">
          Don&apos;t have an account?{' '}
          <Link href="/auth/register" className="text-[rgb(var(--theme-primary-rgb))] hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  )
}

function LoginFallback() {
  return (
    <div className="max-w-md w-full">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Welcome back</h1>
        <p className="text-zinc-400">Sign in to your account</p>
      </div>
      <div className="bg-zinc-900 rounded-lg p-8 border border-zinc-800 text-center">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3" />
        <p className="text-zinc-400 text-sm">Loading...</p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <Suspense fallback={<LoginFallback />}>
        <LoginContent />
      </Suspense>
    </div>
  )
}
