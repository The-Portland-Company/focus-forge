#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function cleanDuplicateProjects() {
  console.log('🧹 Cleaning duplicate projects...\n');
  
  // Get all duplicate projects
  const { data: duplicates } = await supabase.rpc('get_duplicate_projects');
  
  // Manual query for duplicates
  const { data: allProjects } = await supabase
    .from('projects')
    .select('*')
    .order('name')
    .order('created_at');
  
  // Group by name and organization
  const projectGroups = {};
  allProjects.forEach(p => {
    const key = `${p.name}_${p.organization_id}`;
    if (!projectGroups[key]) {
      projectGroups[key] = [];
    }
    projectGroups[key].push(p);
  });
  
  // Process duplicates
  let totalDeleted = 0;
  for (const [key, projects] of Object.entries(projectGroups)) {
    if (projects.length > 1) {
      // Keep the oldest
      projects.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      const keepProject = projects[0];
      const deleteProjects = projects.slice(1);
      
      console.log(`📁 "${keepProject.name}" has ${projects.length} copies`);
      console.log(`  ✅ Keeping: ${keepProject.id}`);
      
      for (const delProj of deleteProjects) {
        // Move tasks to the kept project
        const { data: tasks } = await supabase
          .from('tasks')
          .select('id')
          .eq('project_id', delProj.id);
        
        if (tasks && tasks.length > 0) {
          const { error: updateError } = await supabase
            .from('tasks')
            .update({ project_id: keepProject.id })
            .eq('project_id', delProj.id);
          
          if (!updateError) {
            console.log(`    ↪️ Moved ${tasks.length} tasks to original project`);
          }
        }
        
        // Delete duplicate project
        const { error: delError } = await supabase
          .from('projects')
          .delete()
          .eq('id', delProj.id);
        
        if (!delError) {
          console.log(`    🗑️ Deleted duplicate: ${delProj.id}`);
          totalDeleted++;
        }
      }
    }
  }
  
  console.log(`\n✅ Deleted ${totalDeleted} duplicate projects`);
}

cleanDuplicateProjects();