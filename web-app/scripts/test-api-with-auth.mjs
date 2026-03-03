#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testAPIWithAuth() {
  console.log('Testing API with authentication...\n');
  
  // First login
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'spencerdhill@protonmail.com',
    password: '***REMOVED***'
  });
  
  if (authError) {
    console.error('❌ Login failed:', authError.message);
    return;
  }
  
  console.log('✅ Login successful!');
  console.log('Access token:', authData.session.access_token.substring(0, 50) + '...');
  
  // Now test the API with the auth token
  console.log('\n📊 Testing /api/database endpoint...');
  
  const response = await fetch('http://localhost:3244/api/database', {
    headers: {
      'Authorization': `Bearer ${authData.session.access_token}`,
      'Cookie': `sb-access-token=${authData.session.access_token}; sb-refresh-token=${authData.session.refresh_token}`
    }
  });
  
  const data = await response.json();
  
  if (response.ok) {
    console.log('✅ API call successful!');
    console.log('Organizations:', data.organizations?.length || 0);
    console.log('Projects:', data.projects?.length || 0);
    console.log('Tasks:', data.tasks?.length || 0);
  } else {
    console.error('❌ API call failed:', data.error || 'Unknown error');
  }
}

testAPIWithAuth();