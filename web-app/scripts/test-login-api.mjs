#!/usr/bin/env node

async function testLogin() {
  const response = await fetch('http://localhost:3244/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: 'spencerdhill@protonmail.com',
      password: '***REMOVED***'
    })
  });
  
  const data = await response.json();
  
  console.log('Status:', response.status);
  console.log('Response:', JSON.stringify(data, null, 2));
  
  if (response.ok) {
    console.log('✅ Login successful!');
  } else {
    console.log('❌ Login failed');
  }
}

testLogin().catch(console.error);