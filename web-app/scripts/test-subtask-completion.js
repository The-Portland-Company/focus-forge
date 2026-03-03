// Test script to verify subtask completion functionality

const testSubtaskCompletion = async () => {
  console.log('Testing subtask completion functionality...\n');

  // Create a parent task
  console.log('1. Creating parent task...');
  const parentTaskResponse = await fetch('http://localhost:3244/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Parent Task - Test Subtask Completion',
      description: 'This is a test parent task with subtasks',
      projectId: null,
      priority: 4,
      dueDate: new Date().toISOString().split('T')[0],
      completed: false
    })
  });
  
  const parentTask = await parentTaskResponse.json();
  console.log('   Parent task created:', parentTask.id);

  // Create subtasks
  console.log('\n2. Creating subtasks...');
  const subtasks = [];
  
  for (let i = 1; i <= 3; i++) {
    const subtaskResponse = await fetch('http://localhost:3244/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Subtask ${i}`,
        description: `This is subtask ${i}`,
        projectId: null,
        priority: 4,
        parentId: parentTask.id,
        completed: false
      })
    });
    
    const subtask = await subtaskResponse.json();
    subtasks.push(subtask);
    console.log(`   Subtask ${i} created:`, subtask.id);
  }

  // Test 1: Complete a single subtask
  console.log('\n3. Testing individual subtask completion...');
  const completeSubtaskResponse = await fetch(`http://localhost:3244/api/tasks/${subtasks[0].id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ completed: true })
  });
  
  console.log('   Subtask 1 marked as completed:', completeSubtaskResponse.ok);

  // Test 2: Complete parent task (should complete all remaining subtasks)
  console.log('\n4. Completing parent task (should complete all subtasks)...');
  const completeParentResponse = await fetch(`http://localhost:3244/api/tasks/${parentTask.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      completed: true,
      completedAt: new Date().toISOString()
    })
  });
  
  console.log('   Parent task marked as completed:', completeParentResponse.ok);

  // Verify all subtasks are completed
  console.log('\n5. Verifying all subtasks are completed...');
  const dbResponse = await fetch('http://localhost:3244/api/database');
  const database = await dbResponse.json();
  
  const allSubtasks = database.tasks.filter(t => t.parentId === parentTask.id);
  const completedSubtasks = allSubtasks.filter(t => t.completed);
  
  console.log(`   Total subtasks: ${allSubtasks.length}`);
  console.log(`   Completed subtasks: ${completedSubtasks.length}`);
  console.log(`   All subtasks completed: ${allSubtasks.length === completedSubtasks.length ? 'YES ✓' : 'NO ✗'}`);

  // Clean up - delete test tasks
  console.log('\n6. Cleaning up test data...');
  for (const subtask of subtasks) {
    await fetch(`http://localhost:3244/api/tasks/${subtask.id}`, { method: 'DELETE' });
  }
  await fetch(`http://localhost:3244/api/tasks/${parentTask.id}`, { method: 'DELETE' });
  console.log('   Test tasks deleted.');
  
  console.log('\nTest completed!');
};

// Run the test
testSubtaskCompletion().catch(console.error);