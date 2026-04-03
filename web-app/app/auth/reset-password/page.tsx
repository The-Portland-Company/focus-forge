'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, KeyRound, Loader2, Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type ResetState = 'loading' | 'ready' | 'success' | 'error'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [state, setState] = useState<ResetState>('loading')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    const supabase = createClient()

    const applySessionState = async ({ allowError }: { allowError: boolean }) => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (session?.user) {
        setState('ready')
        return
      }

      if (allowError) {
        setState('error')
        setMessage('This reset link is invalid or has expired. Request a new password reset email.')
      }
    }

    const timer = window.setTimeout(() => {
      void applySessionState({ allowError: true })
    }, 400)

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') && session?.user) {
        window.clearTimeout(timer)
        setState('ready')
      }
    })

    void applySessionState({ allowError: false })

    return () => {
      window.clearTimeout(timer)
      subscription.unsubscribe()
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

    setIsSubmitting(true)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password })

      if (error) {
        throw error
      }

      setState('success')
      setMessage('Your password has been updated. Redirecting to your workspace...')
      window.setTimeout(() => router.push('/today'), 1200)
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
