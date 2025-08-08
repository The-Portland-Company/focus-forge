// Simple test to verify dependency functionality

async function simpleDependencyTest() {
  console.log('Simple dependency test...\n');
  
  try {
    // 1. First check if API is accessible
    console.log('1. Checking API accessibility...');
    const healthCheck = await fetch('http://localhost:3244/api/database');
    console.log('   API status:', healthCheck.status);
    
    if (!healthCheck.ok) {
      console.error('   API is not accessible. Make sure the server is running on port 3244.');
      return;
    }
    
    // 2. Create two simple tasks
    console.log('\n2. Creating test tasks...');
    
    // Task A
    const taskAResponse = await fetch('http://localhost:3244/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Dependency Test - Task A',
        description: 'This task has no dependencies',
        priority: 3,
        completed: false
      })
    });
    const taskA = await taskAResponse.json();
    console.log('   Task A created:', taskA.id);
    
    // Task B depends on A
    const taskBResponse = await fetch('http://localhost:3244/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Dependency Test - Task B',
        description: 'This task depends on Task A',
        priority: 3,
        completed: false,
        dependsOn: [taskA.id]
      })
    });
    const taskB = await taskBResponse.json();
    console.log('   Task B created (depends on A):', taskB.id);
    console.log('   Task B dependencies:', taskB.dependsOn);
    
    // 3. Test completing Task B (should fail)
    console.log('\n3. Testing blocked completion...');
    const blockResponse = await fetch(`http://localhost:3244/api/tasks/${taskB.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: true })
    });
    
    console.log('   Response status:', blockResponse.status);
    if (blockResponse.status === 400) {
      const error = await blockResponse.json();
      console.log('   ✓ Correctly blocked:', error.error);
    } else if (blockResponse.ok) {
      console.log('   ✗ ERROR: Task was completed despite dependency!');
    }
    
    // 4. Complete Task A
    console.log('\n4. Completing Task A...');
    await fetch(`http://localhost:3244/api/tasks/${taskA.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: true })
    });
    console.log('   Task A marked as completed');
    
    // 5. Now try completing Task B again
    console.log('\n5. Testing unblocked completion...');
    const unblockResponse = await fetch(`http://localhost:3244/api/tasks/${taskB.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: true })
    });
    
    console.log('   Response status:', unblockResponse.status);
    if (unblockResponse.ok) {
      console.log('   ✓ Task B successfully completed');
    } else {
      const error = await unblockResponse.json();
      console.log('   ✗ ERROR:', error.error);
    }
    
    // 6. Cleanup
    console.log('\n6. Cleaning up...');
    await fetch(`http://localhost:3244/api/tasks/${taskA.id}`, { method: 'DELETE' });
    await fetch(`http://localhost:3244/api/tasks/${taskB.id}`, { method: 'DELETE' });
    console.log('   Test tasks deleted');
    
    console.log('\n✅ Simple dependency test completed!');
    
  } catch (error) {
    console.error('\n❌ Test error:', error.message);
    console.error('Make sure the development server is running on port 3244');
  }
}

// Run test
simpleDependencyTest();