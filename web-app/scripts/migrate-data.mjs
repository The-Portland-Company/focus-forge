import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables')
  process.exit(1)
}

// Create Supabase admin client
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// Load existing data from file
const dataPath = join(__dirname, '..', 'data', 'database.json')
let fileData
try {
  fileData = JSON.parse(readFileSync(dataPath, 'utf-8'))
} catch (error) {
  console.log('No existing data file found, starting fresh')
  fileData = {
    organizations: [],
    projects: [],
    tasks: [],
    tags: [],
    sections: []
  }
}

async function migrateData() {
  console.log('Starting data migration to Supabase...')
  
  const userId = 'f7c172d9-f2de-43a0-a984-8f6b7b17c70d' // Your user ID
  
  // Count existing data
  console.log('\n📊 Data to migrate:')
  console.log('   - Organizations:', fileData.organizations?.length || 0)
  console.log('   - Projects:', fileData.projects?.length || 0)
  console.log('   - Tasks:', fileData.tasks?.length || 0)
  console.log('   - Tags:', fileData.tags?.length || 0)
  console.log('   - Sections:', fileData.sections?.length || 0)
  
  // Create a default organization if none exist
  if (!fileData.organizations?.length) {
    console.log('\n📁 Creating default organization...')
    const { data: org, error } = await supabase
      .from('organizations')
      .insert({
        name: 'Personal',
        description: 'Personal projects and tasks',
        color: '#007AFF',
        order_index: 0
      })
      .select()
      .single()
    
    if (error) {
      console.error('Error creating organization:', error)
      return
    }
    
    // Add user to organization
    await supabase
      .from('user_organizations')
      .insert({
        user_id: userId,
        organization_id: org.id,
        is_owner: true
      })
    
    console.log('✅ Created organization:', org.name)
    
    // Create a sample project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert({
        name: 'Inbox',
        description: 'Default inbox for tasks',
        organization_id: org.id,
        color: '#808080',
        is_favorite: false,
        order_index: 0
      })
      .select()
      .single()
    
    if (projectError) {
      console.error('Error creating project:', projectError)
    } else {
      console.log('✅ Created project:', project.name)
    }
  } else {
    // Migrate existing organizations
    console.log('\n📁 Migrating organizations...')
    for (const org of fileData.organizations) {
      const { data, error } = await supabase
        .from('organizations')
        .insert({
          id: org.id,
          name: org.name,
          description: org.description,
          color: org.color || '#007AFF',
          archived: org.archived || false,
          order_index: org.order || 0
        })
        .select()
        .single()
      
      if (error) {
        console.error(`   ❌ Failed to migrate ${org.name}:`, error.message)
      } else {
        console.log(`   ✅ Migrated ${org.name}`)
        
        // Add user to organization
        await supabase
          .from('user_organizations')
          .insert({
            user_id: userId,
            organization_id: data.id,
            is_owner: true
          })
      }
    }
    
    // Migrate projects
    if (fileData.projects?.length) {
      console.log('\n📁 Migrating projects...')
      for (const project of fileData.projects) {
        const { data, error } = await supabase
          .from('projects')
          .insert({
            id: project.id,
            name: project.name,
            description: project.description,
            organization_id: project.organizationId,
            color: project.color || '#EA580C',
            is_favorite: project.isFavorite || false,
            archived: project.archived || false,
            order_index: project.order || 0,
            budget: project.budget,
            deadline: project.deadline,
            todoist_id: project.todoistId
          })
          .select()
          .single()
        
        if (error) {
          console.error(`   ❌ Failed to migrate ${project.name}:`, error.message)
        } else {
          console.log(`   ✅ Migrated ${project.name}`)
        }
      }
    }
    
    // Migrate tags
    if (fileData.tags?.length) {
      console.log('\n🏷️  Migrating tags...')
      for (const tag of fileData.tags) {
        const { error } = await supabase
          .from('tags')
          .insert({
            id: tag.id,
            name: tag.name,
            color: tag.color || '#EA580C',
            todoist_id: tag.todoistId
          })
        
        if (error) {
          console.error(`   ❌ Failed to migrate ${tag.name}:`, error.message)
        } else {
          console.log(`   ✅ Migrated ${tag.name}`)
        }
      }
    }
    
    // Migrate sections
    if (fileData.sections?.length) {
      console.log('\n📑 Migrating sections...')
      for (const section of fileData.sections) {
        const { error } = await supabase
          .from('sections')
          .insert({
            id: section.id,
            name: section.name,
            project_id: section.projectId,
            parent_id: section.parentId,
            color: section.color,
            description: section.description,
            icon: section.icon,
            order_index: section.order || 0,
            todoist_id: section.todoistId
          })
        
        if (error) {
          console.error(`   ❌ Failed to migrate ${section.name}:`, error.message)
        } else {
          console.log(`   ✅ Migrated ${section.name}`)
        }
      }
    }
    
    // Migrate tasks
    if (fileData.tasks?.length) {
      console.log('\n✅ Migrating tasks...')
      let migrated = 0
      let failed = 0
      
      for (const task of fileData.tasks) {
        const { error } = await supabase
          .from('tasks')
          .insert({
            id: task.id,
            name: task.name,
            description: task.description,
            due_date: task.dueDate,
            due_time: task.dueTime,
            priority: task.priority || 4,
            project_id: task.projectId,
            assigned_to: task.assignedTo === userId ? userId : null,
            completed: task.completed || false,
            completed_at: task.completedAt,
            todoist_id: task.todoistId,
            recurring_pattern: task.recurringPattern,
            parent_id: task.parentId,
            indent: task.indent || 0,
            section_id: task.sectionId
          })
        
        if (error) {
          failed++
          console.error(`   ❌ Failed to migrate task:`, error.message)
        } else {
          migrated++
        }
      }
      
      console.log(`   ✅ Migrated ${migrated} tasks`)
      if (failed > 0) {
        console.log(`   ❌ Failed to migrate ${failed} tasks`)
      }
    }
  }
  
  console.log('\n🎉 Migration complete!')
}

migrateData().catch(console.error)