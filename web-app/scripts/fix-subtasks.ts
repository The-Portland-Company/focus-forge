import { getDatabase, saveDatabase } from '../lib/db'
import { Task } from '../lib/types'

async function fixSubtasks() {
  console.log('🔧 Fixing subtask relationships...')
  
  try {
    const db = await getDatabase()
    let fixedCount = 0
    
    // Group tasks by project
    const tasksByProject = new Map<string, Task[]>()
    db.tasks.forEach(task => {
      if (!tasksByProject.has(task.projectId)) {
        tasksByProject.set(task.projectId, [])
      }
      tasksByProject.get(task.projectId)!.push(task)
    })
    
    // Process each project's tasks
    tasksByProject.forEach((projectTasks, projectId) => {
      // Sort tasks by their original order (assuming they're in order in the array)
      const taskStack: { task: Task, indent: number }[] = []
      
      projectTasks.forEach(task => {
        const indent = task.indent || 1
        
        // If indent > 1, find parent
        if (indent > 1) {
          // Look backwards in the stack for a task with lower indent
          for (let i = taskStack.length - 1; i >= 0; i--) {
            if (taskStack[i].indent < indent) {
              // Found parent
              task.parentId = taskStack[i].task.id
              fixedCount++
              break
            }
          }
        }
        
        // Add current task to stack
        taskStack.push({ task, indent })
      })
    })
    
    // Save the updated database
    await saveDatabase(db)
    
    console.log(`✅ Fixed ${fixedCount} subtask relationships`)
    console.log('📊 Summary:')
    console.log(`- Total tasks: ${db.tasks.length}`)
    console.log(`- Tasks with parents: ${db.tasks.filter(t => t.parentId).length}`)
    console.log(`- Root tasks: ${db.tasks.filter(t => !t.parentId).length}`)
    
  } catch (error) {
    console.error('❌ Error fixing subtasks:', error)
    process.exit(1)
  }
}

fixSubtasks()