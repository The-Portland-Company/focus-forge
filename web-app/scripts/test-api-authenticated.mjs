#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testAuthenticatedAPI() {
  // First login
  console.log('🔐 Logging in...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'spencerdhill@protonmail.com',
    password: '***REMOVED***'
  });
  
  if (authError) {
    console.error('❌ Login failed:', authError.message);
    return;
  }
  
  console.log('✅ Login successful!');
  
  // Test the API with cookies
  console.log('\n📊 Testing /api/database endpoint with cookies...');
  
  const cookies = [
    `sb-${supabaseUrl.split('//')[1].split('.')[0]}-auth-token=${JSON.stringify({
      access_token: authData.session.access_token,
      refresh_token: authData.session.refresh_token,
      provider_token: null,
      provider_refresh_token: null,
      user: authData.user
    })}`
  ].join('; ');
  
  const response = await fetch('http://localhost:3244/api/database', {
    headers: {
      'Cookie': cookies
    }
  });
  
  const data = await response.json();
  
  if (response.ok) {
    console.log('✅ API call successful!');
    console.log('Data structure:', {
      hasOrganizations: !!data.organizations,
      organizationCount: data.organizations?.length || 0,
      hasProjects: !!data.projects,
      projectCount: data.projects?.length || 0,
      hasTasks: !!data.tasks,
      taskCount: data.tasks?.length || 0
    });
    
    if (data.organizations?.length > 0) {
      console.log('\nFirst organization:', data.organizations[0].name);
    }
    if (data.projects?.length > 0) {
      console.log('First project:', data.projects[0].name);
    }
    if (data.tasks?.length > 0) {
      console.log('First task:', data.tasks[0].name || data.tasks[0].title);
    }
  } else {
    console.error('❌ API call failed:', data.error || 'Unknown error');
  }
}

testAuthenticatedAPI();