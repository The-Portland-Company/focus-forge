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

// Mimic the SupabaseAdapter class
class SupabaseAdapter {
  constructor(supabase, userId) {
    this.supabase = supabase
    this.userId = userId
    console.log('🔧 SupabaseAdapter initialized with userId:', userId)
  }

  async getOrganizations(userId) {
    const supabase = this.supabase
    const targetUserId = userId || this.userId
    
    console.log('🔍 SupabaseAdapter.getOrganizations - Fetching for user:', targetUserId)
    
    // Get organizations the user belongs to
    const { data: userOrgs, error: userOrgsError } = await supabase
      .from('user_organizations')
      .select('organization_id')
      .eq('user_id', targetUserId)
    
    console.log('📊 User organizations query result:', { 
      userOrgs, 
      userOrgsError,
      count: userOrgs?.length 
    })
    
    if (userOrgsError) {
      console.error('❌ Error fetching user organizations:', userOrgsError)
      return []
    }
    
    if (!userOrgs || userOrgs.length === 0) {
      console.log('No organizations found for user')
      return []
    }
    
    const orgIds = userOrgs.map(uo => uo.organization_id)
    console.log('📋 Organization IDs to fetch:', orgIds.length, 'IDs')
    
    // Fetch the actual organizations
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .in('id', orgIds)
      .order('order_index')

    if (error) {
      console.error('Error fetching organizations:', error)
      throw error
    }
    
    console.log('📊 Organizations fetched:', { 
      count: data?.length, 
      firstOrg: data?.[0]?.name,
      data: data?.slice(0, 2) // Log first 2 orgs for debugging
    })
    
    return data || []
  }
}

async function test() {
  const userId = 'f7c172d9-f2de-43a0-a984-8f6b7b17c70d' // Spencer's ID
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
  
  console.log('Testing exactly as API route does...\n')
  
  const adapter = new SupabaseAdapter(supabase, userId)
  
  let organizations = []
  
  try {
    console.log('📝 Fetching organizations for user:', userId)
    organizations = await adapter.getOrganizations()
    console.log('✅ Organizations fetched:', organizations.length)
    console.log('First 3 orgs:', organizations.slice(0, 3).map(o => o.name))
  } catch (error) {
    console.error('❌ Error fetching organizations:', error)
    console.error('Full error details:', JSON.stringify(error, null, 2))
  }
}

test()