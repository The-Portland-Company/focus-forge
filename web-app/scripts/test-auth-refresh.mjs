#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function testAuthRefresh() {
  console.log('🔑 Testing authentication and session refresh...\n')
  
  // Test with your test user credentials
  const email = 'test@example.com' // Replace with your test email
  const password = 'testpassword123' // Replace with your test password
  
  try {
    // Sign in
    console.log('1️⃣ Signing in...')
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password
    })
    
    if (signInError) {
      console.error('❌ Sign in failed:', signInError.message)
      return
    }
    
    console.log('✅ Signed in successfully')
    console.log('   User ID:', signInData.user?.id)
    console.log('   Email:', signInData.user?.email)
    
    // Get session
    console.log('\n2️⃣ Getting session...')
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    
    if (sessionError) {
      console.error('❌ Get session failed:', sessionError.message)
    } else {
      console.log('✅ Session retrieved successfully')
      console.log('   Session exists:', !!session)
      console.log('   User ID:', session?.user?.id)
    }
    
    // Try to refresh the session
    console.log('\n3️⃣ Refreshing session...')
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession()
    
    if (refreshError) {
      console.error('❌ Session refresh failed:', refreshError.message)
    } else {
      console.log('✅ Session refreshed successfully')
      console.log('   New session exists:', !!refreshData.session)
      console.log('   User ID:', refreshData.session?.user?.id)
    }
    
    // Test API call
    console.log('\n4️⃣ Testing API call to /api/auth-debug...')
    const response = await fetch('http://localhost:3244/api/auth-debug', {
      headers: {
        'Cookie': `sb-${supabaseUrl.split('//')[1].split('.')[0]}-auth-token=${session?.access_token}`
      }
    })
    
    if (response.ok) {
      const data = await response.json()
      console.log('✅ API call successful')
      console.log('   Auth status:', data.auth?.session?.exists ? 'Authenticated' : 'Not authenticated')
    } else {
      console.error('❌ API call failed:', response.status, response.statusText)
    }
    
    // Sign out
    console.log('\n5️⃣ Signing out...')
    await supabase.auth.signOut()
    console.log('✅ Signed out successfully')
    
  } catch (error) {
    console.error('❌ Test failed:', error)
  }
}

testAuthRefresh()