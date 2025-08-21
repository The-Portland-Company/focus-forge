'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function AcceptInvitePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  
  useEffect(() => {
    const acceptInvite = async () => {
      try {
        // Get the organization from URL params
        const org = searchParams.get('org')
        if (org) {
          setOrganizationId(org)
        }
        
        // Check if we're using Supabase
        const useSupabase = process.env.NEXT_PUBLIC_USE_SUPABASE === 'true'
        
        if (!useSupabase) {
          setStatus('error')
          setMessage('Email invitations are not available in file-based mode. Please contact your administrator.')
          return
        }
        
        // The Supabase Auth will handle the token verification automatically
        // when the user clicks the link in their email
        const supabase = createClient()
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (error) {
          setStatus('error')
          setMessage('Invalid or expired invitation link.')
          return
        }
        
        if (session) {
          // User successfully accepted the invitation
          setStatus('success')
          setMessage('Invitation accepted successfully! Redirecting...')
          
          // Update the user's status in the database
          if (org) {
            try {
              await fetch('/api/accept-invite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  userId: session.user.id,
                  email: session.user.email,
                  organizationId: org
                })
              })
            } catch (err) {
              console.error('Failed to update local database:', err)
            }
          }
          
          // Redirect to the main app
          setTimeout(() => {
            router.push('/')
          }, 2000)
        } else {
          // No session means the link might be invalid or expired
          setStatus('error')
          setMessage('Invalid or expired invitation link. Please request a new invitation.')
        }
      } catch (error) {
        console.error('Error accepting invite:', error)
        setStatus('error')
        setMessage('An error occurred while accepting the invitation.')
      }
    }
    
    acceptInvite()
  }, [searchParams, router])
  
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-zinc-900 rounded-lg p-8 text-center">
        {status === 'loading' && (
          <>
            <div className="w-16 h-16 border-4 border-theme-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Processing Invitation</h2>
            <p className="text-zinc-400">Please wait while we verify your invitation...</p>
          </>
        )}
        
        {status === 'success' && (
          <>
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2 text-green-500">Invitation Accepted!</h2>
            <p className="text-zinc-400 mb-4">{message}</p>
            <p className="text-sm text-zinc-500">Redirecting to the application...</p>
          </>
        )}
        
        {status === 'error' && (
          <>
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2 text-red-500">Invitation Error</h2>
            <p className="text-zinc-400 mb-6">{message}</p>
            <Link 
              href="/auth/login"
              className="inline-block px-6 py-2 bg-theme-gradient text-white rounded-lg hover:opacity-90 transition-opacity"
            >
              Go to Login
            </Link>
          </>
        )}
      </div>
    </div>
  )
}