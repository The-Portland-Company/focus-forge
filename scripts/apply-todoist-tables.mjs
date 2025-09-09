#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { join } from 'path';

// Load environment variables
config({ path: join(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function testConnection() {
  console.log('Testing Supabase connection...');
  
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .limit(1);

  if (error) {
    console.error('Connection failed:', error);
    return false;
  }

  console.log('✅ Connection successful!');
  return true;
}

async function main() {
  const connected = await testConnection();
  
  if (!connected) {
    console.error('Could not connect to Supabase. Please check your credentials.');
    process.exit(1);
  }

  console.log('\n===========================================');
  console.log('Todoist Migration Prepared Successfully!');
  console.log('===========================================\n');
  console.log('The migration file has been created at:');
  console.log('supabase/migrations/20250902_todoist_integration.sql\n');
  console.log('To apply this migration, please:');
  console.log('1. Go to your Supabase dashboard');
  console.log('2. Navigate to SQL Editor');
  console.log('3. Copy and paste the migration SQL');
  console.log('4. Click "Run"\n');
  console.log('Dashboard URL: https://app.supabase.com/project/qjgtmaomcnbmdhvatelf/sql/new\n');
}

main();