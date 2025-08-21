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

async function testQueries() {
  const userId = 'f7c172d9-f2de-43a0-a984-8f6b7b17c70d' // Spencer's ID
  
  console.log('🔍 Testing service role queries for Spencer...\n')
  
  // Test user_organizations query
  console.log('1️⃣ Testing user_organizations query:')
  const { data: userOrgs, error: userOrgsError } = await supabase
    .from('user_organizations')
    .select('organization_id')
    .eq('user_id', userId)
  
  console.log('   Result:', { count: userOrgs?.length, error: userOrgsError })
  if (userOrgs && userOrgs.length > 0) {
    console.log('   First 3 org IDs:', userOrgs.slice(0, 3).map(o => o.organization_id))
  }
  
  // Test organizations query if we have org IDs
  if (userOrgs && userOrgs.length > 0) {
    console.log('\n2️⃣ Testing organizations query:')
    const orgIds = userOrgs.map(uo => uo.organization_id)
    const { data: orgs, error: orgsError } = await supabase
      .from('organizations')
      .select('*')
      .in('id', orgIds)
      .limit(3)
    
    console.log('   Result:', { count: orgs?.length, error: orgsError })
    if (orgs) {
      orgs.forEach(org => {
        console.log(`   - ${org.name}`)
      })
    }
  }
  
  // Test projects query
  console.log('\n3️⃣ Testing projects query:')
  const { data: projects, error: projectsError } = await supabase
    .from('projects')
    .select('*')
    .limit(5)
  
  console.log('   Result:', { count: projects?.length, error: projectsError })
  if (projects) {
    projects.forEach(proj => {
      console.log(`   - ${proj.name} (org: ${proj.organization_id})`)
    })
  }
  
  // Test tasks query
  console.log('\n4️⃣ Testing tasks query:')
  const { data: tasks, error: tasksError } = await supabase
    .from('tasks')
    .select('*')
    .or(`assigned_to.eq.${userId},assigned_to.is.null`)
    .limit(5)
  
  console.log('   Result:', { count: tasks?.length, error: tasksError })
  if (tasks) {
    tasks.forEach(task => {
      console.log(`   - ${task.name.substring(0, 50)}...`)
    })
  }
}

testQueries()