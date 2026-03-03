#!/usr/bin/env node

// Script to migrate existing data from file-based database to Supabase
// Run this after creating initial users

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { config } from 'dotenv';

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

// Read existing database
const databasePath = join(process.cwd(), 'data', 'database.json');
const database = JSON.parse(readFileSync(databasePath, 'utf-8'));

// Map old user IDs to new Supabase user IDs
const userMapping = new Map();

async function migrateData() {
  console.log('Starting data migration...\n');

  try {
    // First, get the super admin user to associate organizations with
    const { data: superAdminProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', 'spencerdhill@protonmail.com')
      .single();

    if (!superAdminProfile) {
      console.error('Super admin user not found. Please run create-users script first.');
      process.exit(1);
    }

    console.log('Found super admin user:', superAdminProfile.id);

    // Map old user IDs to super admin for now (since we don't have all users created)
    database.users.forEach(user => {
      userMapping.set(user.id, superAdminProfile.id);
    });

    // Migrate organizations
    console.log('\nMigrating organizations...');
    const orgMapping = new Map();
    
    for (const org of database.organizations) {
      const { data: newOrg, error } = await supabase
        .from('organizations')
        .insert({
          name: org.name,
          description: org.description || null,
          color: org.color || '#EA580C',
          archived: org.archived || false,
          order_index: org.order || 0
        })
        .select()
        .single();

      if (error) {
        console.error(`Error creating organization ${org.name}:`, error);
        continue;
      }

      orgMapping.set(org.id, newOrg.id);
      console.log(`✓ Created organization: ${org.name}`);

      // Associate super admin with this organization
      await supabase.from('user_organizations').insert({
        user_id: superAdminProfile.id,
        organization_id: newOrg.id
      });
    }

    // Migrate projects
    console.log('\nMigrating projects...');
    const projectMapping = new Map();

    for (const project of database.projects) {
      const orgId = orgMapping.get(project.organizationId);
      if (!orgId) {
        console.warn(`Skipping project ${project.name} - organization not found`);
        continue;
      }

      const { data: newProject, error } = await supabase
        .from('projects')
        .insert({
          name: project.name,
          description: project.description || null,
          color: project.color || '#EA580C',
          organization_id: orgId,
          is_favorite: project.isFavorite || false,
          archived: project.archived || false,
          budget: project.budget || null,
          deadline: project.deadline || null,
          order_index: project.order || 0,
          todoist_id: project.todoistId || null
        })
        .select()
        .single();

      if (error) {
        console.error(`Error creating project ${project.name}:`, error);
        continue;
      }

      projectMapping.set(project.id, newProject.id);
      console.log(`✓ Created project: ${project.name}`);
    }

    // Migrate tags
    console.log('\nMigrating tags...');
    const tagMapping = new Map();

    for (const tag of database.tags) {
      const { data: newTag, error } = await supabase
        .from('tags')
        .insert({
          name: tag.name,
          color: tag.color || '#EA580C'
        })
        .select()
        .single();

      if (error) {
        console.error(`Error creating tag ${tag.name}:`, error);
        continue;
      }

      tagMapping.set(tag.id, newTag.id);
      console.log(`✓ Created tag: ${tag.name}`);
    }

    // Migrate tasks (sorted to handle parent-child relationships)
    console.log('\nMigrating tasks...');
    const taskMapping = new Map();
    
    // First pass: create all tasks without parent_id
    for (const task of database.tasks) {
      const projectId = projectMapping.get(task.projectId);
      if (!projectId) {
        console.warn(`Skipping task ${task.name} - project not found`);
        continue;
      }

      const assignedTo = task.assignedTo ? userMapping.get(task.assignedTo) : null;

      const { data: newTask, error } = await supabase
        .from('tasks')
        .insert({
          name: task.name,
          description: task.description || null,
          due_date: task.dueDate || null,
          due_time: task.dueTime || null,
          priority: task.priority || 4,
          deadline: task.deadline || null,
          project_id: projectId,
          assigned_to: assignedTo,
          completed: task.completed || false,
          completed_at: task.completedAt || null,
          todoist_id: task.todoistId || null,
          recurring_pattern: task.recurringPattern || null,
          indent: task.indent || 0
        })
        .select()
        .single();

      if (error) {
        console.error(`Error creating task ${task.name}:`, error);
        continue;
      }

      taskMapping.set(task.id, newTask.id);
      console.log(`✓ Created task: ${task.name}`);
    }

    // Second pass: update parent relationships
    console.log('\nUpdating task parent relationships...');
    for (const task of database.tasks) {
      if (task.parentId) {
        const taskId = taskMapping.get(task.id);
        const parentId = taskMapping.get(task.parentId);
        
        if (taskId && parentId) {
          const { error } = await supabase
            .from('tasks')
            .update({ parent_id: parentId })
            .eq('id', taskId);

          if (error) {
            console.error(`Error updating parent for task ${task.name}:`, error);
          } else {
            console.log(`✓ Updated parent relationship for: ${task.name}`);
          }
        }
      }

      // Migrate task tags
      if (task.tags && task.tags.length > 0) {
        const taskId = taskMapping.get(task.id);
        if (taskId) {
          for (const tagId of task.tags) {
            const newTagId = tagMapping.get(tagId);
            if (newTagId) {
              await supabase.from('task_tags').insert({
                task_id: taskId,
                tag_id: newTagId
              });
            }
          }
        }
      }

      // Migrate reminders
      if (task.reminders && task.reminders.length > 0) {
        const taskId = taskMapping.get(task.id);
        if (taskId) {
          for (const reminder of task.reminders) {
            await supabase.from('reminders').insert({
              task_id: taskId,
              type: reminder.type,
              value: reminder.value,
              unit: reminder.unit || null,
              amount: reminder.amount || null
            });
          }
        }
      }

      // Migrate attachments
      if (task.attachments && task.attachments.length > 0) {
        const taskId = taskMapping.get(task.id);
        if (taskId) {
          for (const attachment of task.attachments) {
            await supabase.from('attachments').insert({
              task_id: taskId,
              name: attachment.name,
              url: attachment.url,
              type: attachment.type
            });
          }
        }
      }
    }

    console.log('\n✅ Migration complete!');
    console.log(`
Summary:
- Organizations: ${database.organizations.length}
- Projects: ${database.projects.length}
- Tasks: ${database.tasks.length}
- Tags: ${database.tags.length}

All data has been migrated to Supabase and associated with the super admin user.
`);

  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
}

migrateData().then(() => process.exit(0));