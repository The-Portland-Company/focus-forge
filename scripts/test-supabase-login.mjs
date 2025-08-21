#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

console.log('Supabase URL:', supabaseUrl);
console.log('Anon Key:', supabaseAnonKey.substring(0, 20) + '...');

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testLogin() {
  console.log('\nAttempting login with ***REMOVED***...');
  
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: 'spencerdhill@protonmail.com',
      password: '***REMOVED***'
    });
    
    if (error) {
      console.error('❌ Login failed:', error);
      return false;
    }
    
    console.log('✅ Login successful!');
    console.log('User ID:', data.user.id);
    console.log('Email:', data.user.email);
    
    return true;
  } catch (err) {
    console.error('❌ Exception during login:', err);
    return false;
  }
}

testLogin();