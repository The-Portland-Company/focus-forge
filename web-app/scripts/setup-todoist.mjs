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
const todoistToken = process.env.TODOIST_API_TOKEN

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables')
  process.exit(1)
}

// Create Supabase admin client
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function setupTodoist() {
  console.log('Setting up Todoist integration...')
  
  // Update user profile with Todoist token
  const { data: profile, error } = await supabase
    .from('profiles')
    .update({
      todoist_api_token: todoistToken,
      todoist_sync_enabled: true,
      todoist_auto_sync: true,
      todoist_sync_frequency: 30
    })
    .eq('email', 'spencerdhill@protonmail.com')
    .select()
    .single()
  
  if (error) {
    console.error('Error updating profile:', error)
    return
  }
  
  console.log('✅ Todoist integration configured for user:', profile.email)
  console.log('   - API Token:', todoistToken ? 'Set' : 'Not set')
  console.log('   - Sync Enabled:', profile.todoist_sync_enabled)
  console.log('   - Auto Sync:', profile.todoist_auto_sync)
  console.log('   - Sync Frequency:', profile.todoist_sync_frequency, 'minutes')
  
  // Create initial sync state
  const { data: syncState, error: syncError } = await supabase
    .from('todoist_sync_state')
    .upsert({
      user_id: profile.id,
      sync_token: null,
      full_sync: true,
      status: 'idle',
      error_count: 0,
      consecutive_failures: 0
    }, {
      onConflict: 'user_id'
    })
    .select()
    .single()
  
  if (syncError) {
    console.error('Error creating sync state:', syncError)
  } else {
    console.log('✅ Sync state initialized')
  }
  
  console.log('\n🎉 Todoist integration is ready!')
  console.log('   You can now sync your Todoist data through the app')
}

setupTodoist()