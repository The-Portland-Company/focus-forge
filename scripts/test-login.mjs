#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testLogin() {
  console.log('Testing login with ***REMOVED***...\n');
  
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'spencerdhill@protonmail.com',
    password: '***REMOVED***'
  });
  
  if (error) {
    console.error('❌ Login failed:', error.message);
    return false;
  }
  
  console.log('✅ Login successful!');
  console.log('User ID:', data.user.id);
  console.log('Email:', data.user.email);
  
  // Now test fetching data
  console.log('\n📊 Testing data access...');
  
  const { data: orgs, error: orgError } = await supabase
    .from('organizations')
    .select('*')
    .limit(5);
  
  if (orgError) {
    console.error('❌ Failed to fetch organizations:', orgError.message);
  } else {
    console.log(`✅ Found ${orgs.length} organizations`);
    orgs.forEach(org => console.log(`  - ${org.name}`));
  }
  
  return !error;
}

testLogin();