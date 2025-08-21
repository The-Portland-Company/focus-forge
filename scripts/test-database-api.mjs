#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Use anon key first for auth, then create authenticated client
const authSupabase = createClient(supabaseUrl, supabaseAnonKey);

async function testDatabaseApi() {
  try {
    // Login first
    const { data: authData, error: authError } = await authSupabase.auth.signInWithPassword({
      email: 'spencerdhill@protonmail.com',
      password: '***REMOVED***'
    });
    
    if (authError) {
      console.error('Auth error:', authError);
      return;
    }
    
    console.log('✅ Logged in as:', authData.user.email);
    const userId = authData.user.id;
    
    // Now use the authenticated client for queries
    const supabase = authSupabase;
    
    // Get user organizations
    const { data: userOrgs, error: userOrgsError } = await supabase
      .from('user_organizations')
      .select('organization_id')
      .eq('user_id', userId);
    
    console.log('📊 User organizations:', userOrgs?.length || 0);
    if (userOrgsError) {
      console.error('Error fetching user orgs:', userOrgsError);
    }
    
    // Also try without the filter to see if RLS is working
    const { data: allUserOrgs, error: allError } = await supabase
      .from('user_organizations')
      .select('*');
    console.log('📊 All user organizations (RLS filtered):', allUserOrgs?.length || 0);
    if (allError) {
      console.error('Error fetching all user orgs:', allError);
    }
    
    if (userOrgs && userOrgs.length > 0) {
      const orgIds = userOrgs.map(uo => uo.organization_id);
      
      // Get organizations
      const { data: orgs } = await supabase
        .from('organizations')
        .select('*')
        .in('id', orgIds);
      
      console.log('📊 Organizations found:', orgs?.length || 0);
      if (orgs && orgs.length > 0) {
        console.log('First org:', orgs[0].name);
      }
      
      // Get projects
      const { data: projects } = await supabase
        .from('projects')
        .select('*')
        .in('organization_id', orgIds);
      
      console.log('📊 Projects found:', projects?.length || 0);
      if (projects && projects.length > 0) {
        console.log('First project:', projects[0].name);
      }
      
      // Get tasks
      const { data: tasks } = await supabase
        .from('tasks')
        .select('*')
        .eq('assigned_to', userId)
        .limit(5);
      
      console.log('📊 Tasks found (sample):', tasks?.length || 0);
      if (tasks && tasks.length > 0) {
        console.log('First task:', tasks[0].name);
      }
    }
    
  } catch (err) {
    console.error('Error:', err);
  }
}

testDatabaseApi();