// Simple API check

async function checkAPI() {
  try {
    console.log('Checking API endpoints...\n');
    
    // 1. Check database endpoint
    const dbResponse = await fetch('http://localhost:3244/api/database');
    console.log('Database endpoint:', dbResponse.status);
    
    // 2. Create a simple task
    const createResponse = await fetch('http://localhost:3244/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'API Test Task',
        priority: 3,
        completed: false
      })
    });
    console.log('Create task:', createResponse.status);
    
    if (createResponse.ok) {
      const task = await createResponse.json();
      console.log('Created task ID:', task.id);
      
      // 3. Get the task
      const getResponse = await fetch(`http://localhost:3244/api/tasks/${task.id}`);
      console.log('Get task:', getResponse.status);
      
      // 4. Update the task
      const updateResponse = await fetch(`http://localhost:3244/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: true })
      });
      console.log('Update task:', updateResponse.status);
      
      if (!updateResponse.ok) {
        const text = await updateResponse.text();
        console.log('Update error response:', text.substring(0, 200));
      }
      
      // 5. Delete the task
      const deleteResponse = await fetch(`http://localhost:3244/api/tasks/${task.id}`, {
        method: 'DELETE'
      });
      console.log('Delete task:', deleteResponse.status);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkAPI();