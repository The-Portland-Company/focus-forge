#!/usr/bin/env node

import fetch from 'node-fetch'

async function testAPI() {
  console.log('Testing API with authentication...\n')
  
  // First login to get auth cookies
  const loginRes = await fetch('http://127.0.0.1:3244/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: 'spencerdhill@protonmail.com',
      password: '***REMOVED***'
    })
  })
  
  if (!loginRes.ok) {
    console.error('Login failed:', await loginRes.text())
    return
  }
  
  // Get the cookies from login response
  const cookies = loginRes.headers.raw()['set-cookie']
  const cookieString = cookies ? cookies.map(c => c.split(';')[0]).join('; ') : ''
  
  console.log('✅ Logged in successfully')
  console.log('🍪 Cookies:', cookieString.substring(0, 100) + '...')
  
  // Now fetch database with auth
  const dbRes = await fetch('http://127.0.0.1:3244/api/database', {
    headers: {
      'Cookie': cookieString
    }
  })
  
  if (!dbRes.ok) {
    console.error('Database fetch failed:', dbRes.status, await dbRes.text())
    return
  }
  
  const data = await dbRes.json()
  
  console.log('\n📊 API Response Summary:')
  console.log('  Organizations:', data.organizations?.length || 0)
  console.log('  Projects:', data.projects?.length || 0)
  console.log('  Tasks:', data.tasks?.length || 0)
  console.log('  Users:', data.users?.length || 0)
  
  if (data.tasks && data.tasks.length > 0) {
    console.log('\n📝 First 3 tasks:')
    data.tasks.slice(0, 3).forEach(t => {
      console.log(`  - ${t.name?.substring(0, 50)}... (project: ${t.project_id?.substring(0, 8)}...)`)
    })
  }
  
  if (data.projects && data.projects.length > 0) {
    console.log('\n📁 First 3 projects:')
    data.projects.slice(0, 3).forEach(p => {
      console.log(`  - ${p.name} (id: ${p.id.substring(0, 8)}...)`)
    })
  }
}

testAPI()