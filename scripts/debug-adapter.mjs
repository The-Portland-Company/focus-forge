#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const userId = 'f7c172d9-f2de-43a0-a984-8f6b7b17c70d'

console.log('Testing what the API should return...\n')

// Test 1: Get organizations
console.log('1️⃣ Getting user organizations...')
const { data: userOrgs } = await supabase
  .from('user_organizations')
  .select('organization_id')
  .eq('user_id', userId)

const orgIds = userOrgs?.map(uo => uo.organization_id) || []
console.log(`   Found ${orgIds.length} organization IDs`)

// Test 2: Get actual organizations
const { data: orgs } = await supabase
  .from('organizations')
  .select('*')
  .in('id', orgIds)

console.log(`   Got ${orgs?.length || 0} organizations`)

// Test 3: Get projects in those organizations
console.log('\n2️⃣ Getting projects...')
const { data: projects } = await supabase
  .from('projects')
  .select('*')
  .in('organization_id', orgIds)

console.log(`   Got ${projects?.length || 0} projects`)
const projectIds = projects?.map(p => p.id) || []

// Test 4: Get tasks in those projects
console.log('\n3️⃣ Getting tasks...')
const { data: tasks } = await supabase
  .from('tasks')
  .select('*')
  .in('project_id', projectIds)

console.log(`   Got ${tasks?.length || 0} tasks`)

// Test what the API endpoint actually returns
console.log('\n4️⃣ Testing actual API endpoint...')
const loginRes = await fetch('http://127.0.0.1:3244/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'spencerdhill@protonmail.com',
    password: '***REMOVED***'
  })
})

const cookies = loginRes.headers.get('set-cookie')
const cookieString = cookies || ''

const dbRes = await fetch('http://127.0.0.1:3244/api/database', {
  headers: { 'Cookie': cookieString }
})

const apiData = await dbRes.json()
console.log('\n📊 API Actually Returns:')
console.log(`   Organizations: ${apiData.organizations?.length || 0}`)
console.log(`   Projects: ${apiData.projects?.length || 0}`)
console.log(`   Tasks: ${apiData.tasks?.length || 0}`)

if (apiData.projects?.length === 0 && projectIds.length > 0) {
  console.log('\n❌ PROBLEM: Projects exist in DB but API returns 0!')
}

if (apiData.tasks?.length === 0 && tasks?.length > 0) {
  console.log('❌ PROBLEM: Tasks exist in DB but API returns 0!')
}