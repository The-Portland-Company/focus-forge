import { getDatabaseAdapter } from '../lib/db/factory'

async function testDatabase() {
  try {
    console.log('Testing database adapter...')
    console.log('USE_SUPABASE env var:', process.env.USE_SUPABASE)
    
    const adapter = getDatabaseAdapter()
    console.log('Adapter type:', adapter.constructor.name)
    
    if (adapter.constructor.name === 'FileAdapter' && adapter.getDatabase) {
      console.log('Using FileAdapter - attempting to load database...')
      const database = await adapter.getDatabase()
      console.log('Database loaded successfully!')
      console.log('Users:', database.users.length)
      console.log('Organizations:', database.organizations.length)
      console.log('Projects:', database.projects.length)
      console.log('Tasks:', database.tasks.length)
      
      if (database.users.length > 0) {
        console.log('First user:', database.users[0])
      }
      if (database.organizations.length > 0) {
        console.log('First organization:', database.organizations[0])
      }
    } else {
      console.log('Not using FileAdapter')
    }
  } catch (error) {
    console.error('Error:', error)
  }
}

testDatabase()