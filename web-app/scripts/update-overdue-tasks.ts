import fs from 'fs/promises'
import path from 'path'
import { Database } from '../lib/types'

async function updateOverdueTasks() {
  const databasePath = path.join(process.cwd(), 'data', 'database.json')
  
  // Read the database
  const data = await fs.readFile(databasePath, 'utf-8')
  const database: Database = JSON.parse(data)
  
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().split('T')[0]
  
  let updatedCount = 0
  
  // Update overdue tasks
  database.tasks = database.tasks.map(task => {
    if (task.dueDate) {
      const taskDate = new Date(task.dueDate)
      taskDate.setHours(0, 0, 0, 0)
      
      // If task is overdue (before today), update due date to today
      if (taskDate < today) {
        updatedCount++
        return {
          ...task,
          dueDate: todayStr,
          updatedAt: new Date().toISOString()
        }
      }
    }
    return task
  })
  
  // Save the updated database
  await fs.writeFile(databasePath, JSON.stringify(database, null, 2))
  
  console.log(`✅ Updated ${updatedCount} overdue tasks to have today's date (${todayStr})`)
}

updateOverdueTasks().catch(console.error)