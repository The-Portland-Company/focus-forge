import { runMigration } from '../lib/todoist-migration'

async function main() {
  console.log('🚀 Starting Todoist migration...')
  console.log('⚠️  This will replace all existing data in database.json')
  console.log('')
  
  try {
    await runMigration()
    console.log('✅ Migration completed successfully!')
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

main()