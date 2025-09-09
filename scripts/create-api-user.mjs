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
  console.error('Missing Supabase environment variables')
  console.log('Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env')
  process.exit(1)
}

// Create Supabase admin client
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function createApiUser() {
  const email = 'api-sync@command-center.local'
  const password = 'CommandCenter2025API!' // You can change this
  
  console.log('Creating API user for external sync...')
  
  // Create the user
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // Auto-confirm email
    user_metadata: {
      name: 'API Sync User',
      role: 'api'
    }
  })
  
  if (error) {
    if (error.message.includes('already exists')) {
      console.log('User already exists. Updating password...')
      
      // Update the password if user exists
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        data?.user?.id || '',
        { password }
      )
      
      if (updateError) {
        console.error('Error updating user:', updateError)
        process.exit(1)
      }
    } else {
      console.error('Error creating user:', error)
      process.exit(1)
    }
  }
  
  console.log('\n✅ API User Created/Updated Successfully!\n')
  console.log('Share these credentials with the other application:')
  console.log('=' * 50)
  console.log(`Email: ${email}`)
  console.log(`Password: ${password}`)
  console.log(`Supabase URL: ${supabaseUrl}`)
  console.log(`Supabase Anon Key: ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`)
  console.log('=' * 50)
  console.log('\nThe other application can use these to authenticate and get JWT tokens.')
}

createApiUser()