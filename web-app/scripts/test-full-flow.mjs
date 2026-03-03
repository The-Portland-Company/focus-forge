#!/usr/bin/env node

async function testFullFlow() {
  console.log('1. Testing login...');
  
  const loginResponse = await fetch('http://localhost:3244/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: 'spencerdhill@protonmail.com',
      password: '***REMOVED***'
    })
  });
  
  const loginData = await loginResponse.json();
  
  if (!loginResponse.ok) {
    console.error('❌ Login failed:', loginData.error);
    return;
  }
  
  console.log('✅ Login successful');
  
  // Extract cookies from response
  const setCookieHeader = loginResponse.headers.get('set-cookie');
  console.log('Cookies set:', setCookieHeader ? 'Yes' : 'No');
  
  // 2. Test database API
  console.log('\n2. Testing database API...');
  
  const dbResponse = await fetch('http://localhost:3244/api/database', {
    headers: {
      'Cookie': setCookieHeader || ''
    }
  });
  
  const dbData = await dbResponse.json();
  
  if (!dbResponse.ok) {
    console.error('❌ Database API failed:', dbData.error);
    return;
  }
  
  console.log('✅ Database API successful');
  console.log('- Organizations:', dbData.organizations?.length || 0);
  console.log('- Projects:', dbData.projects?.length || 0);
  console.log('- Tasks:', dbData.tasks?.length || 0);
  
  if (dbData.organizations?.length > 0) {
    console.log('\nFirst 3 organizations:');
    dbData.organizations.slice(0, 3).forEach(org => {
      console.log(`  - ${org.name}`);
    });
  }
  
  if (dbData.projects?.length > 0) {
    console.log('\nFirst 3 projects:');
    dbData.projects.slice(0, 3).forEach(proj => {
      console.log(`  - ${proj.name}`);
    });
  }
  
  if (dbData.tasks?.length > 0) {
    console.log('\nFirst 3 tasks:');
    dbData.tasks.slice(0, 3).forEach(task => {
      console.log(`  - ${task.name || task.title || 'Unnamed'}`);
    });
  }
}

testFullFlow().catch(console.error);