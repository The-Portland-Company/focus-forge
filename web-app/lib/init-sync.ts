// Initialize Todoist sync scheduler on app start
// This is imported in the root layout to ensure it runs once

let initialized = false

export async function initializeTodoistSync() {
  // Only initialize once
  if (initialized) return
  
  // Only run on server
  if (typeof window !== 'undefined') return
  
  initialized = true
  
  try {
    console.log('[InitSync] Initializing Todoist sync scheduler...')
    
    // Import the scheduler (dynamic import to ensure server-only)
    const { syncScheduler } = await import('./services/sync-scheduler')
    
    // Start the scheduler
    await syncScheduler.startAll()
    
    console.log('[InitSync] Todoist sync scheduler initialized successfully')
  } catch (error) {
    console.error('[InitSync] Failed to initialize Todoist sync scheduler:', error)
  }
}

// Auto-initialize when the module is imported
if (typeof window === 'undefined') {
  initializeTodoistSync()
}