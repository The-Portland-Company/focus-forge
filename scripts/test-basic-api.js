// Test basic API functionality

async function testBasicAPI() {
  console.log('Testing basic API functionality...\n');
  
  try {
    // 1. Create a simple task
    console.log('1. Creating a simple task...');
    const createResponse = await fetch('http://localhost:3244/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Task',
        priority: 3,
        completed: false
      })
    });
    
    console.log('   Create response:', createResponse.status);
    if (!createResponse.ok) {
      const error = await createResponse.text();
      console.log('   Error:', error.substring(0, 200));
      return;
    }
    
    const task = await createResponse.json();
    console.log('   Task created:', task.id);
    console.log('   Task name:', task.name);
    console.log('   Task completed:', task.completed);
    
    // 2. Update the task using the tasks API directly
    console.log('\n2. Updating task via PUT...');
    const updateUrl = `http://localhost:3244/api/tasks/${task.id}`;
    console.log('   Update URL:', updateUrl);
    
    const updateResponse = await fetch(updateUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: true })
    });
    
    console.log('   Update response:', updateResponse.status);
    console.log('   Response headers:', updateResponse.headers.get('content-type'));
    
    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.log('   Error response:', errorText.substring(0, 500));
    } else {
      const updated = await updateResponse.json();
      console.log('   Updated task completed:', updated.completed);
    }
    
    // 3. Check database directly
    console.log('\n3. Checking database directly...');
    const dbResponse = await fetch('http://localhost:3244/api/database');
    const database = await dbResponse.json();
    const dbTask = database.tasks.find(t => t.id === task.id);
    console.log('   Task in database completed:', dbTask?.completed);
    
    // 4. Cleanup
    console.log('\n4. Cleaning up...');
    const deleteResponse = await fetch(updateUrl, { method: 'DELETE' });
    console.log('   Delete response:', deleteResponse.status);
    
  } catch (error) {
    console.error('\nError:', error);
  }
}

testBasicAPI();