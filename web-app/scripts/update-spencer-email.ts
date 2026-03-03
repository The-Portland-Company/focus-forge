import { getDatabase, saveDatabase } from '../lib/db'
import { User } from '../lib/types'

async function updateSpencerEmail() {
  console.log('Loading database...')
  const database = await getDatabase()
  
  // Find Spencer Hill's user record
  const spencer = database.users.find(user => 
    user.id === 'user-47554087' && 
    user.firstName === 'Spencer' && 
    user.lastName === 'Hill'
  )
  
  if (!spencer) {
    console.error('Spencer Hill user not found!')
    process.exit(1)
  }
  
  console.log('Found Spencer Hill:', spencer)
  
  // Update email
  spencer.email = 'spencerdhill@protonmail.com'
  
  console.log('Updated Spencer Hill with email:', spencer)
  
  // Save database
  await saveDatabase(database)
  console.log('Database updated successfully!')
}

updateSpencerEmail().catch(console.error)