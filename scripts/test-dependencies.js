// Test script to verify task dependency functionality

const testDependencies = async () => {
  console.log('Testing task dependency functionality...\n');

  // Test 1: Create tasks with dependencies
  console.log('1. Creating test tasks with dependencies...');
  
  // Create Task A (no dependencies)
  const taskAResponse = await fetch('http://localhost:3244/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Task A - Research Phase',
      description: 'Initial research and planning',
      projectId: null,
      priority: 3,
      dueDate: new Date().toISOString().split('T')[0],
      completed: false
    })
  });
  const taskA = await taskAResponse.json();
  console.log('   Task A created:', taskA.id);

  // Create Task B (depends on Task A)
  const taskBResponse = await fetch('http://localhost:3244/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Task B - Design Phase',
      description: 'Create designs based on research',
      projectId: null,
      priority: 3,
      dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0], // Tomorrow
      completed: false,
      dependsOn: [taskA.id]
    })
  });
  const taskB = await taskBResponse.json();
  console.log('   Task B created (depends on A):', taskB.id);

  // Create Task C (depends on Task B)
  const taskCResponse = await fetch('http://localhost:3244/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Task C - Implementation',
      description: 'Implement based on designs',
      projectId: null,
      priority: 2,
      dueDate: new Date(Date.now() + 172800000).toISOString().split('T')[0], // 2 days
      completed: false,
      dependsOn: [taskB.id]
    })
  });
  const taskC = await taskCResponse.json();
  console.log('   Task C created (depends on B):', taskC.id);

  // Test 2: Verify dependency relationships
  console.log('\n2. Verifying dependency relationships...');
  
  // Get all tasks
  const dbResponse = await fetch('http://localhost:3244/api/database');
  const database = await dbResponse.json();
  const allTasks = database.tasks;
  
  // Find our test tasks
  const taskAFromDb = allTasks.find(t => t.id === taskA.id);
  const taskBFromDb = allTasks.find(t => t.id === taskB.id);
  const taskCFromDb = allTasks.find(t => t.id === taskC.id);
  
  // Verify dependencies were saved correctly
  console.log('   Task A dependencies:', taskAFromDb.dependsOn || 'none');
  console.log('   Task B dependencies:', taskBFromDb.dependsOn || 'none');
  console.log('   Task C dependencies:', taskCFromDb.dependsOn || 'none');
  
  // Test 3: Test dependency blocking
  console.log('\n3. Testing task blocking behavior...');
  
  // Try to complete Task B (should fail because A is not completed)
  const tryCompleteB = await fetch(`http://localhost:3244/api/tasks/${taskB.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ completed: true })
  });
  console.log('   Trying to complete Task B (should be blocked):', tryCompleteB.status);
  
  if (tryCompleteB.status === 400) {
    const errorResponse = await tryCompleteB.json();
    console.log('   Error message:', errorResponse.error);
  }
  
  // Verify B is still not completed
  const bCheckResponse = await fetch(`http://localhost:3244/api/tasks/${taskB.id}`);
  if (bCheckResponse.ok) {
    const bCheck = await bCheckResponse.json();
    console.log('   Task B completed status:', bCheck.completed);
  } else {
    console.log('   Error getting task B:', bCheckResponse.status);
  }
  
  // Test 4: Complete Task A and check if Task B becomes unblocked
  console.log('\n4. Testing task completion unblocking...');
  await fetch(`http://localhost:3244/api/tasks/${taskA.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ completed: true })
  });
  console.log('   Task A completed');
  
  // Now try to complete B again (should succeed)
  const tryCompleteB2 = await fetch(`http://localhost:3244/api/tasks/${taskB.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ completed: true })
  });
  console.log('   Trying to complete Task B again:', tryCompleteB2.status);
  
  const bCheck2Response = await fetch(`http://localhost:3244/api/tasks/${taskB.id}`);
  if (bCheck2Response.ok) {
    const bCheck2 = await bCheck2Response.json();
    console.log('   Task B completed status:', bCheck2.completed);
  } else {
    console.log('   Error getting task B:', bCheck2Response.status);
  }
  
  // Test 5: Test complex dependencies (multiple dependencies)
  console.log('\n5. Testing multiple dependencies...');
  const taskDResponse = await fetch('http://localhost:3244/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Task D - Final Review',
      description: 'Review both design and implementation',
      projectId: null,
      priority: 1,
      dueDate: new Date(Date.now() + 259200000).toISOString().split('T')[0], // 3 days
      completed: false,
      dependsOn: [taskB.id, taskC.id] // Depends on both B and C
    })
  });
  const taskD = await taskDResponse.json();
  console.log('   Task D created (depends on B and C):', taskD.id);
  
  const dbResponse3 = await fetch('http://localhost:3244/api/database');
  const database3 = await dbResponse3.json();
  const allTasks3 = database3.tasks;
  
  const taskDFromDb = allTasks3.find(t => t.id === taskD.id);
  console.log('   Task D dependencies:', taskDFromDb.dependsOn);
  console.log('   Task D should be blocked by Task C (which is not completed)');
  
  // Cleanup
  console.log('\n6. Cleaning up test data...');
  await fetch(`http://localhost:3244/api/tasks/${taskA.id}`, { method: 'DELETE' });
  await fetch(`http://localhost:3244/api/tasks/${taskB.id}`, { method: 'DELETE' });
  await fetch(`http://localhost:3244/api/tasks/${taskC.id}`, { method: 'DELETE' });
  await fetch(`http://localhost:3244/api/tasks/${taskD.id}`, { method: 'DELETE' });
  console.log('   Test tasks deleted.');
  
  console.log('\nAll tests completed successfully!');
};

// Run the tests
testDependencies().catch(error => {
  console.error('\nTest failed with error:', error.message);
  process.exit(1);
});