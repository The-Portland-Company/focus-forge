#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testDirectly() {
  console.log('Testing with service role key...\n');
  
  // First, check if user exists
  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(
    'f7c172d9-f2de-43a0-a984-8f6b7b17c70d'
  );
  
  if (userError) {
    console.error('❌ Error fetching user:', userError);
  } else {
    console.log('✅ User found:', userData.user.email);
  }
  
  // Update the user's password directly
  console.log('\nUpdating password to ***REMOVED***...');
  const { data: updateData, error: updateError } = await supabase.auth.admin.updateUserById(
    'f7c172d9-f2de-43a0-a984-8f6b7b17c70d',
    { password: '***REMOVED***' }
  );
  
  if (updateError) {
    console.error('❌ Error updating password:', updateError);
  } else {
    console.log('✅ Password updated successfully');
  }
  
  // Now test login with anon key
  const anonSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  
  console.log('\nTesting login with updated password...');
  const { data: loginData, error: loginError } = await anonSupabase.auth.signInWithPassword({
    email: 'spencerdhill@protonmail.com',
    password: '***REMOVED***'
  });
  
  if (loginError) {
    console.error('❌ Login failed:', loginError);
  } else {
    console.log('✅ Login successful!');
    console.log('Session access token:', loginData.session.access_token.substring(0, 50) + '...');
  }
}

testDirectly();