#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testDataAccess() {
  console.log('Testing data access with service role...\n');
  
  // Test fetching organizations
  console.log('📊 Fetching organizations...');
  const { data: orgs, error: orgError } = await supabase
    .from('organizations')
    .select('*')
    .limit(5);
  
  if (orgError) {
    console.error('❌ Failed to fetch organizations:', orgError.message);
  } else {
    console.log(`✅ Found ${orgs.length} organizations`);
    orgs.forEach(org => console.log(`  - ${org.name} (${org.id})`));
  }
  
  // Test fetching projects
  console.log('\n📊 Fetching projects...');
  const { data: projects, error: projError } = await supabase
    .from('projects')
    .select('*')
    .limit(5);
  
  if (projError) {
    console.error('❌ Failed to fetch projects:', projError.message);
  } else {
    console.log(`✅ Found ${projects.length} projects`);
    projects.forEach(proj => console.log(`  - ${proj.name} (${proj.id})`));
  }
  
  // Test fetching tasks
  console.log('\n📊 Fetching tasks...');
  const { data: tasks, error: taskError } = await supabase
    .from('tasks')
    .select('*')
    .limit(5);
  
  if (taskError) {
    console.error('❌ Failed to fetch tasks:', taskError.message);
  } else {
    console.log(`✅ Found ${tasks.length} tasks`);
    tasks.forEach(task => console.log(`  - ${task.title} (${task.id})`));
  }
}

testDataAccess();