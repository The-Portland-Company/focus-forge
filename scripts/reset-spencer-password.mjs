#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function resetPassword() {
  try {
    console.log('🔑 Resetting password for spencerdhill@protonmail.com...')
    
    // Update the user's password using the admin API
    const { data, error } = await supabase.auth.admin.updateUserById(
      'f7c172d9-f2de-43a0-a984-8f6b7b17c70d',
      { password: '***REMOVED***' }
    )
    
    if (error) {
      console.error('❌ Error resetting password:', error)
      process.exit(1)
    }
    
    console.log('✅ Password reset successfully for Spencer')
    console.log('📧 Email: spencerdhill@protonmail.com')
    console.log('🔐 Password: ***REMOVED***')
    
  } catch (error) {
    console.error('❌ Unexpected error:', error)
    process.exit(1)
  }
}

resetPassword()