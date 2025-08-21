#!/usr/bin/env node

import fetch from 'node-fetch'

async function testAPI() {
  console.log('Testing /api/database endpoint...\n')
  
  try {
    const response = await fetch('http://127.0.0.1:3244/api/database', {
      method: 'GET',
      headers: {
        'Cookie': 'fake-cookie-for-testing'
      }
    })
    
    const text = await response.text()
    console.log('Response status:', response.status)
    console.log('Response headers:', response.headers.raw())
    console.log('Response body:', text)
    
    if (response.ok) {
      const data = JSON.parse(text)
      console.log('\n📊 Data counts:')
      console.log('  Organizations:', data.organizations?.length || 0)
      console.log('  Projects:', data.projects?.length || 0)
      console.log('  Tasks:', data.tasks?.length || 0)
      console.log('  Users:', data.users?.length || 0)
    }
  } catch (error) {
    console.error('Error:', error)
  }
}

testAPI()