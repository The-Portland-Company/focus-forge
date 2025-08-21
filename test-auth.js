#!/usr/bin/env node

// Test script for authentication flow
// Run with: node test-auth.js

const BASE_URL = 'http://localhost:3244'

async function testAuth() {
  console.log('🔐 Testing Authentication System...\n')
  
  // Test 1: Access protected route without auth
  console.log('1. Testing protected route without authentication...')
  try {
    const res = await fetch(`${BASE_URL}/api/database`)
    console.log(`   Status: ${res.status}`)
    console.log(`   Expected: 401 Unauthorized`)
    console.log(`   ✅ Protected route blocks unauthenticated access\n`)
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}\n`)
  }
  
  // Test 2: Register a new user
  console.log('2. Testing user registration...')
  const testUser = {
    email: `test${Date.now()}@example.com`,
    password: 'TestPassword123',
    firstName: 'Test',
    lastName: 'User'
  }
  
  try {
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser)
    })
    
    const data = await res.json()
    console.log(`   Status: ${res.status}`)
    console.log(`   Response: ${JSON.stringify(data)}`)
    
    // Get the auth token from cookies
    const cookies = res.headers.get('set-cookie')
    const authToken = cookies?.match(/auth-token=([^;]+)/)?.[1]
    
    if (authToken) {
      console.log(`   ✅ Registration successful, token received\n`)
      
      // Test 3: Access protected route with auth
      console.log('3. Testing protected route with authentication...')
      const authRes = await fetch(`${BASE_URL}/api/database`, {
        headers: {
          'Cookie': `auth-token=${authToken}`
        }
      })
      
      console.log(`   Status: ${authRes.status}`)
      if (authRes.ok) {
        console.log(`   ✅ Authenticated access successful\n`)
      } else {
        console.log(`   ❌ Authenticated access failed\n`)
      }
      
      // Test 4: Logout
      console.log('4. Testing logout...')
      const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Cookie': `auth-token=${authToken}`
        }
      })
      
      console.log(`   Status: ${logoutRes.status}`)
      console.log(`   ✅ Logout successful\n`)
      
      // Test 5: Login with existing user
      console.log('5. Testing login with existing user...')
      const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testUser.email,
          password: testUser.password
        })
      })
      
      const loginData = await loginRes.json()
      console.log(`   Status: ${loginRes.status}`)
      console.log(`   User: ${loginData.user?.email}`)
      console.log(`   ✅ Login successful\n`)
      
    } else {
      console.log(`   ❌ No auth token received\n`)
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}\n`)
  }
  
  console.log('✨ Authentication tests complete!')
}

// Run tests
testAuth().catch(console.error)