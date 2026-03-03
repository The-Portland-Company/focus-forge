#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testAdapter() {
  const userId = 'f7c172d9-f2de-43a0-a984-8f6b7b17c70d';
  
  console.log('Testing adapter logic directly...\n');
  
  // 1. Get user organizations
  console.log('1. Fetching user_organizations for user:', userId);
  const { data: userOrgs, error: userOrgsError } = await supabase
    .from('user_organizations')
    .select('organization_id')
    .eq('user_id', userId);
  
  if (userOrgsError) {
    console.error('❌ Error:', userOrgsError);
    return;
  }
  
  console.log('✅ Found user_organizations:', userOrgs?.length);
  console.log('Organization IDs:', userOrgs?.map(uo => uo.organization_id));
  
  if (!userOrgs || userOrgs.length === 0) {
    console.log('No organizations found');
    return;
  }
  
  // 2. Get actual organizations
  const orgIds = userOrgs.map(uo => uo.organization_id);
  console.log('\n2. Fetching organizations with IDs:', orgIds);
  
  const { data: orgs, error: orgsError } = await supabase
    .from('organizations')
    .select('*')
    .in('id', orgIds)
    .order('order_index');
  
  if (orgsError) {
    console.error('❌ Error:', orgsError);
    return;
  }
  
  console.log('✅ Found organizations:', orgs?.length);
  if (orgs && orgs.length > 0) {
    console.log('\nFirst 3 organizations:');
    orgs.slice(0, 3).forEach(org => {
      console.log(`  - ${org.name} (${org.id})`);
    });
  }
  
  // 3. Get projects for first org
  if (orgs && orgs.length > 0) {
    const firstOrgId = orgs[0].id;
    console.log(`\n3. Fetching projects for org: ${orgs[0].name}`);
    
    const { data: projects, error: projError } = await supabase
      .from('projects')
      .select('*')
      .eq('organization_id', firstOrgId)
      .limit(5);
    
    if (projError) {
      console.error('❌ Error:', projError);
    } else {
      console.log('✅ Found projects:', projects?.length);
      if (projects && projects.length > 0) {
        projects.forEach(proj => {
          console.log(`  - ${proj.name}`);
        });
      }
    }
  }
}

testAdapter();