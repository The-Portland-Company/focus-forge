#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testProjects() {
  const userId = 'f7c172d9-f2de-43a0-a984-8f6b7b17c70d';
  
  // Get user organizations
  const { data: userOrgs } = await supabase
    .from('user_organizations')
    .select('organization_id')
    .eq('user_id', userId);
  
  console.log('User orgs:', userOrgs?.length);
  
  if (userOrgs && userOrgs.length > 0) {
    const allOrgIds = userOrgs.map(uo => uo.organization_id);
    
    // Get projects
    const { data: projects, error } = await supabase
      .from('projects')
      .select('*')
      .in('organization_id', allOrgIds)
      .order('order_index');
    
    console.log('Projects found:', projects?.length);
    if (error) console.error('Error:', error);
    
    // Group by org
    const projectsByOrg = {};
    projects?.forEach(p => {
      if (!projectsByOrg[p.organization_id]) {
        projectsByOrg[p.organization_id] = [];
      }
      projectsByOrg[p.organization_id].push(p.name);
    });
    
    console.log('\nProjects by org:');
    Object.entries(projectsByOrg).forEach(([orgId, projs]) => {
      console.log(`  ${orgId}: ${projs.length} projects`);
    });
  }
}

testProjects();