#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

// Use service role key to bypass RLS
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function fixDatabase() {
  console.log('🔧 Starting database cleanup...\n');
  
  try {
    // Step 1: Get all organizations grouped by name
    console.log('📊 Analyzing duplicate organizations...');
    const { data: allOrgs, error: orgsError } = await supabase
      .from('organizations')
      .select('*')
      .order('name')
      .order('created_at');
    
    if (orgsError) throw orgsError;
    
    // Group organizations by name
    const orgsByName = {};
    allOrgs.forEach(org => {
      if (!orgsByName[org.name]) {
        orgsByName[org.name] = [];
      }
      orgsByName[org.name].push(org);
    });
    
    // Find duplicates
    const duplicateGroups = Object.entries(orgsByName).filter(([name, orgs]) => orgs.length > 1);
    console.log(`Found ${duplicateGroups.length} organization names with duplicates\n`);
    
    // Step 2: Process each duplicate group
    for (const [name, orgs] of duplicateGroups) {
      console.log(`\n📁 Processing "${name}" (${orgs.length} copies):`);
      
      // Sort by created_at to keep the oldest
      orgs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      const keepOrg = orgs[0];
      const deleteOrgs = orgs.slice(1);
      
      console.log(`  ✅ Keeping: ${keepOrg.id} (created ${keepOrg.created_at})`);
      
      for (const deleteOrg of deleteOrgs) {
        console.log(`  🔍 Checking: ${deleteOrg.id} (created ${deleteOrg.created_at})`);
        
        // Check if this org has any projects
        const { data: projects, error: projError } = await supabase
          .from('projects')
          .select('id, name')
          .eq('organization_id', deleteOrg.id);
        
        if (projError) throw projError;
        
        if (projects && projects.length > 0) {
          console.log(`    ↪️  Migrating ${projects.length} projects to original org...`);
          
          // Update projects to point to the original org
          const { error: updateError } = await supabase
            .from('projects')
            .update({ organization_id: keepOrg.id })
            .eq('organization_id', deleteOrg.id);
          
          if (updateError) throw updateError;
          console.log(`    ✅ Migrated ${projects.length} projects`);
        } else {
          console.log(`    ℹ️  No projects to migrate`);
        }
        
        // Remove user associations for duplicate org
        const { error: delUserOrgError } = await supabase
          .from('user_organizations')
          .delete()
          .eq('organization_id', deleteOrg.id);
        
        if (delUserOrgError) {
          console.log(`    ⚠️  Could not delete user associations: ${delUserOrgError.message}`);
        } else {
          console.log(`    ✅ Removed user associations`);
        }
        
        // Delete the duplicate organization
        const { error: delOrgError } = await supabase
          .from('organizations')
          .delete()
          .eq('id', deleteOrg.id);
        
        if (delOrgError) {
          console.log(`    ❌ Could not delete org: ${delOrgError.message}`);
        } else {
          console.log(`    ✅ Deleted duplicate organization`);
        }
      }
    }
    
    // Step 3: Verify final state
    console.log('\n\n📊 Verifying final state...');
    
    const { data: finalOrgs } = await supabase
      .from('organizations')
      .select('name')
      .order('name');
    
    console.log(`✅ Final organization count: ${finalOrgs?.length || 0}`);
    
    // Check for any remaining duplicates
    const finalOrgNames = new Set(finalOrgs?.map(o => o.name) || []);
    if (finalOrgNames.size === finalOrgs?.length) {
      console.log('✅ No duplicates remain!');
    } else {
      console.log('⚠️  Some duplicates may still exist');
    }
    
    // Step 4: Test data access for user
    console.log('\n📊 Testing data access for spencerdhill@protonmail.com...');
    
    const userId = 'f7c172d9-f2de-43a0-a984-8f6b7b17c70d';
    
    const { data: userOrgs } = await supabase
      .from('user_organizations')
      .select('organization_id')
      .eq('user_id', userId);
    
    console.log(`  User has access to ${userOrgs?.length || 0} organizations`);
    
    if (userOrgs && userOrgs.length > 0) {
      const orgIds = userOrgs.map(uo => uo.organization_id);
      
      const { data: projects } = await supabase
        .from('projects')
        .select('id')
        .in('organization_id', orgIds);
      
      console.log(`  User has access to ${projects?.length || 0} projects`);
      
      const { data: tasks } = await supabase
        .from('tasks')
        .select('id')
        .eq('assigned_to', userId)
        .limit(100);
      
      console.log(`  User has ${tasks?.length || 0}+ tasks assigned`);
    }
    
    console.log('\n✅ Database cleanup complete!');
    
  } catch (error) {
    console.error('\n❌ Error during cleanup:', error);
    process.exit(1);
  }
}

fixDatabase();