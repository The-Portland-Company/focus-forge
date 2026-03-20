'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type InviteStep =
  | 'loading'
  | 'setup-password'
  | 'confirm'
  | 'success'
  | 'error'

type InviteValidation = {
  email: string
  firstName: string
  lastName: string
  status: string | null
  requiresPasswordSetup: boolean
}

export function getInviteStep({
  hasSession,
  sessionEmail,
  invitation,
}: {
  hasSession: boolean
  sessionEmail?: string | null
  invitation: InviteValidation
}): InviteStep {
  if (hasSession) {
    return sessionEmail === invitation.email ? 'loading' : 'error'
  }

  return invitation.requiresPasswordSetup ? 'setup-password' : 'confirm'
}

function AcceptInviteContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [step, setStep] = useState<InviteStep>('loading')
  const [message, setMessage] = useState('')
  const [invitation, setInvitation] = useState<InviteValidation | null>(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const token = searchParams.get('token') || ''
  const email = (searchParams.get('email') || '').trim().toLowerCase()

  const acceptInvite = async (options?: { password?: string; autoLogin?: boolean }) => {
    if (!token || !email) {
      setStep('error')
      setMessage('Invalid invitation link. Please request a new invitation.')
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch('/api/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'accept',
          token,
          email,
          password: options?.password,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to accept invitation.')
      }

      if (options?.autoLogin && options.password) {
        const loginResponse = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password: options.password }),
        })

        const loginData = await loginResponse.json()
        if (!loginResponse.ok) {
          throw new Error(loginData.error || 'Invitation accepted, but sign in failed.')
        }

        setStep('success')
        setMessage('Invitation accepted. Redirecting to your workspace...')
        setTimeout(() => router.push('/today'), 1200)
        return
      }

      setStep('success')
      setMessage('Invitation accepted. You can sign in now.')
    } catch (error) {
      setStep('error')
      setMessage(error instanceof Error ? error.message : 'Failed to accept invitation.')
    } finally {
      setIsSubmitting(false)
    }
  }

  useEffect(() => {
    const loadInvite = async () => {
      if (!token || !email) {
        setStep('error')
        setMessage('Invalid invitation link. Please request a new invitation.')
        return
      }

      try {
        const response = await fetch('/api/accept-invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'validate',
            token,
            email,
          }),
        })

        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.error || 'Failed to validate invitation.')
        }

        const invite = data.invitation as InviteValidation
        setInvitation(invite)

        const supabase = createClient()
        const {
          data: { session },
        } = await supabase.auth.getSession()

        const nextStep = getInviteStep({
          hasSession: !!session,
          sessionEmail: session?.user?.email?.trim().toLowerCase() || null,
          invitation: invite,
        })

        if (nextStep === 'loading' && session?.user?.email?.trim().toLowerCase() === invite.email) {
          await acceptInvite()
          return
        }

        if (nextStep === 'error' && session?.user?.email) {
          setMessage(
            `You are signed in as ${session.user.email}. Sign out and open the invitation with ${invite.email}.`
          )
          setStep('error')
          return
        }

        setStep(nextStep)
      } catch (error) {
        setStep('error')
        setMessage(error instanceof Error ? error.message : 'Failed to load invitation.')
      }
    }

    loadInvite()
  }, [email, token])

  const inviteeName =
    invitation && `${invitation.firstName} ${invitation.lastName}`.trim()
      ? `${invitation.firstName} ${invitation.lastName}`.trim()
      : invitation?.email || 'there'

  return (
    <div className="max-w-md w-full bg-zinc-900 rounded-lg p-8 text-center border border-zinc-800">
      {step === 'loading' && (
        <>
          <div className="w-16 h-16 border-4 border-theme-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Processing Invitation</h2>
          <p className="text-zinc-400">Please wait while we verify your invitation...</p>
        </>
      )}

      {step === 'setup-password' && invitation && (
        <>
          <h2 className="text-2xl font-semibold mb-2 text-white">Finish Your Invitation</h2>
          <p className="text-zinc-400 mb-6">
            {inviteeName}, create your password to join Focus: Forge.
          </p>
          <form
            className="space-y-4 text-left"
            onSubmit={async (event) => {
              event.preventDefault()

              if (password.length < 8) {
                setMessage('Please choose a password with at least 8 characters.')
                setStep('error')
                return
              }

              if (password !== confirmPassword) {
                setMessage('Passwords do not match.')
                setStep('error')
                return
              }

              await acceptInvite({ password, autoLogin: true })
            }}
          >
            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-theme-primary focus:outline-none"
                autoComplete="new-password"
                required
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium mb-2">
                Confirm Password
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-theme-primary focus:outline-none"
                autoComplete="new-password"
                required
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-theme-primary px-4 py-2 text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isSubmitting ? 'Finishing...' : 'Accept Invitation'}
            </button>
          </form>
        </>
      )}

      {step === 'confirm' && invitation && (
        <>
          <h2 className="text-2xl font-semibold mb-2 text-white">Accept Invitation</h2>
          <p className="text-zinc-400 mb-6">
            {inviteeName}, confirm this invitation and then sign in to access your workspace.
          </p>
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => acceptInvite()}
              disabled={isSubmitting}
              className="w-full rounded-lg bg-theme-primary px-4 py-2 text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isSubmitting ? 'Accepting...' : 'Accept Invitation'}
            </button>
            <Link
              href={`/auth/login?email=${encodeURIComponent(invitation.email)}`}
              className="block rounded-lg border border-zinc-700 px-4 py-2 text-zinc-300 transition-colors hover:bg-zinc-800"
            >
              Go to Login
            </Link>
          </div>
        </>
      )}

      {step === 'success' && (
        <>
          <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold mb-2 text-green-500">Invitation Accepted</h2>
          <p className="text-zinc-400 mb-6">{message}</p>
          <Link
            href={`/auth/login${email ? `?email=${encodeURIComponent(email)}` : ''}`}
            className="inline-block rounded-lg bg-theme-primary px-6 py-2 text-white transition-opacity hover:opacity-90"
          >
            Go to Login
          </Link>
        </>
      )}

      {step === 'error' && (
        <>
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold mb-2 text-red-500">Invitation Error</h2>
          <p className="text-zinc-400 mb-6">{message}</p>
          <Link
            href={`/auth/login${email ? `?email=${encodeURIComponent(email)}` : ''}`}
            className="inline-block rounded-lg bg-theme-primary px-6 py-2 text-white transition-opacity hover:opacity-90"
          >
            Go to Login
          </Link>
        </>
      )}
    </div>
  )
}

function AcceptInviteFallback() {
  return (
    <div className="max-w-md w-full bg-zinc-900 rounded-lg p-8 text-center border border-zinc-800">
      <div className="w-16 h-16 border-4 border-theme-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
      <h2 className="text-xl font-semibold mb-2">Processing Invitation</h2>
      <p className="text-zinc-400">Please wait while we verify your invitation...</p>
    </div>
  )
}

export default function AcceptInvitePage() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <Suspense fallback={<AcceptInviteFallback />}>
        <AcceptInviteContent />
      </Suspense>
    </div>
  )
}
