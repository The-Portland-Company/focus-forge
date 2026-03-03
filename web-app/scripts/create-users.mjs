#!/usr/bin/env node

// Script to create initial users via Supabase Admin API
// Run this after database schema is set up

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { join } from 'path';

// Load environment variables from .env.local
config({ path: join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables. Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createUsers() {
  console.log('Creating initial users...');

  try {
    // Create super admin user
    console.log('Creating super admin user...');
    const { data: superAdmin, error: superAdminError } = await supabase.auth.admin.createUser({
      email: 'spencerdhill@protonmail.com',
      password: '***REMOVED***',
      email_confirm: true,
      user_metadata: {
        first_name: 'Spencer',
        last_name: 'Hill'
      }
    });

    if (superAdminError) {
      console.error('Error creating super admin:', superAdminError);
    } else {
      console.log('Super admin created:', superAdmin.user.id);
      
      // Update the profile with super_admin role
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ 
          role: 'super_admin',
          first_name: 'Spencer',
          last_name: 'Hill'
        })
        .eq('id', superAdmin.user.id);

      if (profileError) {
        console.error('Error updating super admin profile:', profileError);
      }
    }

    // Create demo user
    console.log('Creating demo user...');
    const { data: demoUser, error: demoUserError } = await supabase.auth.admin.createUser({
      email: 'demo@demo.com',
      password: 'Demo',
      email_confirm: true,
      user_metadata: {
        first_name: 'Demo',
        last_name: 'User'
      }
    });

    if (demoUserError) {
      console.error('Error creating demo user:', demoUserError);
    } else {
      console.log('Demo user created:', demoUser.user.id);
      
      // Update the profile with admin role
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ 
          role: 'admin',
          first_name: 'Demo',
          last_name: 'User'
        })
        .eq('id', demoUser.user.id);

      if (profileError) {
        console.error('Error updating demo user profile:', profileError);
      }
    }

    // Create demo organization
    console.log('Creating demo organization...');
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: 'The Portland Company',
        description: 'Demo organization for The Portland Company projects',
        color: '#3B82F6',
        order_index: 0
      })
      .select()
      .single();

    if (orgError) {
      console.error('Error creating organization:', orgError);
    } else {
      console.log('Organization created:', org.id);

      // Associate users with organization
      if (superAdmin && !superAdminError) {
        await supabase.from('user_organizations').insert({
          user_id: superAdmin.user.id,
          organization_id: org.id
        });
      }

      if (demoUser && !demoUserError) {
        await supabase.from('user_organizations').insert({
          user_id: demoUser.user.id,
          organization_id: org.id
        });
      }

      // Create sample projects
      console.log('Creating sample projects...');
      await supabase.from('projects').insert([
        {
          name: 'Website Redesign',
          description: 'Complete redesign of company website',
          color: '#3B82F6',
          organization_id: org.id,
          order_index: 0
        },
        {
          name: 'Mobile App Development',
          description: 'Develop iOS and Android mobile apps',
          color: '#10B981',
          organization_id: org.id,
          order_index: 1
        }
      ]);
    }

    console.log('Initial setup complete!');
    console.log('\nYou can now log in with:');
    console.log('Super Admin: spencerdhill@protonmail.com / ***REMOVED***');
    console.log('Demo User: demo@demo.com / Demo');

  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

createUsers().then(() => process.exit(0));
