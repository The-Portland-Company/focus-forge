import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing Supabase credentials in .env')
  process.exit(1)
}

// Create admin client with service role key
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function setUserPassword() {
  const email = 'spencerdhill@protonmail.com'
  const newPassword = 'Command123!'
  
  try {
    // Update the user's password
    const { data, error } = await supabase.auth.admin.updateUserById(
      'f7c172d9-f2de-43a0-a984-8f6b7b17c70d', // Your user ID
      { password: newPassword }
    )
    
    if (error) {
      console.error('❌ Error updating password:', error)
      return
    }
    
    console.log('✅ Password updated successfully!')
    console.log('📧 Email:', email)
    console.log('🔑 Password:', newPassword)
    console.log('\nYou can now log in with these credentials.')
    
  } catch (error) {
    console.error('❌ Error:', error)
  }
}

setUserPassword()