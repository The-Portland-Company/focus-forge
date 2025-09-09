import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const apiBaseUrl = 'http://localhost:3244/api/sync'

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function getToken() {
  // Sign in with test credentials or use existing session
  const { data: { session }, error } = await supabase.auth.getSession()
  
  if (error || !session) {
    console.log('No existing session, please sign in first through the app')
    process.exit(1)
  }
  
  return session.access_token
}

async function makeRequest(endpoint, options = {}) {
  const token = await getToken()
  
  const response = await fetch(`${apiBaseUrl}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  })
  
  const data = await response.json()
  
  if (!response.ok) {
    throw new Error(`API Error: ${data.error || response.statusText}`)
  }
  
  return data
}

async function testEndpoints() {
  console.log('Testing Command Center API Endpoints...\n')
  
  try {
    // Test Organizations
    console.log('1. Testing Organizations API')
    console.log('   - GET /organizations')
    const orgs = await makeRequest('/organizations')
    console.log(`   ✓ Found ${orgs.length} organizations`)
    
    // Test Projects
    console.log('\n2. Testing Projects API')
    console.log('   - GET /projects')
    const projects = await makeRequest('/projects')
    console.log(`   ✓ Found ${projects.length} projects`)
    
    // Test Tasks
    console.log('\n3. Testing Tasks API')
    console.log('   - GET /tasks')
    const tasks = await makeRequest('/tasks')
    console.log(`   ✓ Found ${tasks.length} tasks`)
    
    // Test Comments
    console.log('\n4. Testing Comments API')
    console.log('   - GET /comments')
    const comments = await makeRequest('/comments')
    console.log(`   ✓ Found ${comments.length} comments`)
    
    // Test Sections
    console.log('\n5. Testing Sections API')
    console.log('   - GET /sections')
    const sections = await makeRequest('/sections')
    console.log(`   ✓ Found ${sections.length} sections`)
    
    // Test Tags
    console.log('\n6. Testing Tags API')
    console.log('   - GET /tags')
    const tags = await makeRequest('/tags')
    console.log(`   ✓ Found ${tags.length} tags`)
    
    // Test creating a new task (if projects exist)
    if (projects.length > 0) {
      console.log('\n7. Testing Task Creation')
      console.log('   - POST /tasks')
      const newTask = await makeRequest('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          name: 'API Test Task',
          projectId: projects[0].id,
          description: 'Created via API test',
          priority: 3
        })
      })
      console.log(`   ✓ Created task: ${newTask.name}`)
      
      // Test updating the task
      console.log('\n8. Testing Task Update')
      console.log(`   - PUT /tasks/${newTask.id}`)
      const updatedTask = await makeRequest(`/tasks/${newTask.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: 'API Test Task (Updated)',
          priority: 2
        })
      })
      console.log(`   ✓ Updated task: ${updatedTask.name}`)
      
      // Test deleting the task
      console.log('\n9. Testing Task Deletion')
      console.log(`   - DELETE /tasks/${newTask.id}`)
      await makeRequest(`/tasks/${newTask.id}`, {
        method: 'DELETE'
      })
      console.log('   ✓ Deleted test task')
    }
    
    // Test bulk operations
    console.log('\n10. Testing Bulk Operations')
    console.log('    - POST /bulk')
    const bulkResult = await makeRequest('/bulk', {
      method: 'POST',
      body: JSON.stringify({
        operations: [
          {
            type: 'tag',
            action: 'create',
            data: {
              name: 'API Test Tag',
              color: '#FF0000'
            }
          }
        ]
      })
    })
    console.log('    ✓ Bulk operation completed')
    
    console.log('\n✅ All API tests passed successfully!')
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message)
    process.exit(1)
  }
}

// Run tests
testEndpoints()