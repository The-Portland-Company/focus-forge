// Basic dependency test without using individual task endpoints

async function testDependenciesBasic() {
  console.log('Testing basic dependency functionality...\n');
  
  try {
    // 1. Create tasks with dependencies
    console.log('1. Creating tasks with dependencies...');
    
    // Task A (no dependencies)
    const taskAResponse = await fetch('http://localhost:3244/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Task A - Base Task',
        priority: 3,
        completed: false
      })
    });
    const taskA = await taskAResponse.json();
    console.log('   Task A created:', taskA.id);
    
    // Task B (depends on A)
    const taskBResponse = await fetch('http://localhost:3244/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Task B - Depends on A',
        priority: 3,
        completed: false,
        dependsOn: [taskA.id]
      })
    });
    const taskB = await taskBResponse.json();
    console.log('   Task B created with dependencies:', taskB.dependsOn);
    
    // 2. Get all tasks and check dependencies
    console.log('\n2. Checking dependencies in database...');
    const dbResponse = await fetch('http://localhost:3244/api/database');
    const database = await dbResponse.json();
    
    const taskAInDb = database.tasks.find(t => t.id === taskA.id);
    const taskBInDb = database.tasks.find(t => t.id === taskB.id);
    
    console.log('   Task A in DB - Dependencies:', taskAInDb.dependsOn || 'none');
    console.log('   Task B in DB - Dependencies:', taskBInDb.dependsOn || 'none');
    
    // 3. Check Today view with dependency filtering
    console.log('\n3. Testing dependency filtering in Today view...');
    const todayResponse = await fetch('http://localhost:3244/today');
    console.log('   Today view response:', todayResponse.status);
    
    // 4. Test completion behavior
    console.log('\n4. Testing task completion with dependencies...');
    
    // First, complete Task A
    const updateAResponse = await fetch(`http://localhost:3244/api/tasks/${taskA.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: true })
    });
    console.log('   Task A update response:', updateAResponse.status);
    if (updateAResponse.ok) {
      const updatedA = await updateAResponse.json();
      console.log('   Task A completed:', updatedA.completed);
    }
    
    // Then complete Task B
    const updateBResponse = await fetch(`http://localhost:3244/api/tasks/${taskB.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: true })
    });
    console.log('   Task B update response:', updateBResponse.status);
    if (updateBResponse.ok) {
      const updatedB = await updateBResponse.json();
      console.log('   Task B completed:', updatedB.completed);
    }
    
    // 5. Verify final state
    console.log('\n5. Verifying final state...');
    // Add a small delay to ensure database is updated
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const finalDbResponse = await fetch('http://localhost:3244/api/database');
    const finalDatabase = await finalDbResponse.json();
    
    const finalTaskA = finalDatabase.tasks.find(t => t.id === taskA.id);
    const finalTaskB = finalDatabase.tasks.find(t => t.id === taskB.id);
    
    console.log('   Task A completed:', finalTaskA?.completed || false);
    console.log('   Task B completed:', finalTaskB?.completed || false);
    
    // 6. Cleanup
    console.log('\n6. Cleaning up...');
    await fetch(`http://localhost:3244/api/tasks/${taskA.id}`, { method: 'DELETE' });
    await fetch(`http://localhost:3244/api/tasks/${taskB.id}`, { method: 'DELETE' });
    console.log('   Test tasks deleted');
    
    console.log('\n✅ Basic dependency test completed!');
    
  } catch (error) {
    console.error('\n❌ Test error:', error.message);
  }
}

// Run test
testDependenciesBasic();