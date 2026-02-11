// Background Sync Scheduler
// Handles automatic periodic syncing with Todoist

import { createClient } from '@supabase/supabase-js'
import { TodoistSyncService } from './todoist-sync'

export class SyncScheduler {
  private static instance: SyncScheduler
  private intervals: Map<string, NodeJS.Timeout> = new Map()
  private _supabase: any

  private get supabase() {
    if (!this._supabase) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Supabase env vars not available')
      }
      this._supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      })
    }
    return this._supabase
  }

  private constructor() {}

  static getInstance(): SyncScheduler {
    if (!SyncScheduler.instance) {
      SyncScheduler.instance = new SyncScheduler()
    }
    return SyncScheduler.instance
  }

  /**
   * Start the sync scheduler for all users
   */
  async startAll() {
    console.log('[SyncScheduler] Starting sync scheduler for all users...')
    
    // Get all users with Todoist enabled
    const { data: users, error } = await this.supabase
      .from('profiles')
      .select('id, todoist_api_token, todoist_sync_enabled, todoist_auto_sync, todoist_sync_frequency')
      .not('todoist_api_token', 'is', null)
      .eq('todoist_sync_enabled', true)
      .eq('todoist_auto_sync', true)

    if (error) {
      console.error('[SyncScheduler] Failed to fetch users:', error)
      return
    }

    if (!users || users.length === 0) {
      console.log('[SyncScheduler] No users with auto-sync enabled')
      return
    }

    console.log(`[SyncScheduler] Found ${users.length} users with auto-sync enabled`)

    // Start sync for each user
    for (const user of users) {
      this.startUserSync(user.id, user.todoist_api_token, user.todoist_sync_frequency || 5)
    }
  }

  /**
   * Start sync scheduler for a specific user
   */
  startUserSync(userId: string, apiToken: string, frequencyMinutes: number) {
    // Clear existing interval if any
    this.stopUserSync(userId)

    console.log(`[SyncScheduler] Starting sync for user ${userId} every ${frequencyMinutes} minutes`)

    // Run initial sync
    this.syncUser(userId, apiToken)

    // Set up interval
    const interval = setInterval(
      () => this.syncUser(userId, apiToken),
      frequencyMinutes * 60 * 1000
    )

    this.intervals.set(userId, interval)
  }

  /**
   * Stop sync scheduler for a specific user
   */
  stopUserSync(userId: string) {
    const interval = this.intervals.get(userId)
    if (interval) {
      clearInterval(interval)
      this.intervals.delete(userId)
      console.log(`[SyncScheduler] Stopped sync for user ${userId}`)
    }
  }

  /**
   * Stop all sync schedulers
   */
  stopAll() {
    console.log('[SyncScheduler] Stopping all sync schedulers...')
    for (const [userId, interval] of this.intervals) {
      clearInterval(interval)
    }
    this.intervals.clear()
  }

  /**
   * Perform sync for a user
   */
  private async syncUser(userId: string, apiToken: string) {
    console.log(`[SyncScheduler] Syncing user ${userId}...`)

    try {
      // Check if we should sync (rate limiting, error backoff, etc.)
      const shouldSync = await this.shouldSync(userId)
      if (!shouldSync) {
        console.log(`[SyncScheduler] Skipping sync for user ${userId} due to rate limiting or errors`)
        return
      }

      // Initialize sync service
      const syncService = new TodoistSyncService(apiToken, this.supabase, userId)

      // Perform incremental sync
      const result = await syncService.incrementalSync()

      if (result.success) {
        console.log(`[SyncScheduler] Sync completed for user ${userId}:`, {
          itemsCreated: result.itemsCreated,
          itemsUpdated: result.itemsUpdated,
          projectsCreated: result.projectsCreated,
          projectsUpdated: result.projectsUpdated
        })

        // Reset error count on success
        await this.supabase
          .from('todoist_sync_state')
          .update({
            error_count: 0,
            consecutive_failures: 0
          })
          .eq('user_id', userId)
      } else {
        console.error(`[SyncScheduler] Sync failed for user ${userId}:`, result.errors)

        // Increment error count
        const { data: syncState } = await this.supabase
          .from('todoist_sync_state')
          .select('error_count, consecutive_failures')
          .eq('user_id', userId)
          .single()

        if (syncState) {
          const newErrorCount = (syncState.error_count || 0) + 1
          const newConsecutiveFailures = (syncState.consecutive_failures || 0) + 1

          await this.supabase
            .from('todoist_sync_state')
            .update({
              error_count: newErrorCount,
              consecutive_failures: newConsecutiveFailures
            })
            .eq('user_id', userId)

          // Stop sync if too many consecutive failures
          if (newConsecutiveFailures >= 5) {
            console.error(`[SyncScheduler] Too many consecutive failures for user ${userId}, stopping sync`)
            this.stopUserSync(userId)
            
            // Disable auto-sync for the user
            await this.supabase
              .from('profiles')
              .update({ todoist_auto_sync: false })
              .eq('id', userId)
          }
        }
      }
    } catch (error) {
      console.error(`[SyncScheduler] Unexpected error syncing user ${userId}:`, error)
    }
  }

  /**
   * Check if we should sync for a user (rate limiting, backoff, etc.)
   */
  private async shouldSync(userId: string): Promise<boolean> {
    // Check sync state
    const { data: syncState } = await this.supabase
      .from('todoist_sync_state')
      .select('sync_status, consecutive_failures, last_sync_at')
      .eq('user_id', userId)
      .single()

    if (!syncState) {
      return true // No state, allow sync
    }

    // Don't sync if already syncing
    if (syncState.sync_status === 'syncing') {
      return false
    }

    // Implement exponential backoff for failures
    if (syncState.consecutive_failures > 0) {
      const lastSync = new Date(syncState.last_sync_at).getTime()
      const now = Date.now()
      const backoffMinutes = Math.min(Math.pow(2, syncState.consecutive_failures), 60) // Max 1 hour
      const backoffMs = backoffMinutes * 60 * 1000

      if (now - lastSync < backoffMs) {
        return false // Still in backoff period
      }
    }

    // Check rate limits
    const { data: recentCalls } = await this.supabase
      .from('todoist_api_calls')
      .select('id')
      .eq('user_id', userId)
      .gte('created_at', new Date(Date.now() - 60000).toISOString()) // Last minute

    if (recentCalls && recentCalls.length >= 400) { // Leave some buffer below 450 limit
      return false
    }

    return true
  }

  /**
   * Handle user settings update
   */
  async handleUserUpdate(userId: string) {
    // Get updated user settings
    const { data: user } = await this.supabase
      .from('profiles')
      .select('todoist_api_token, todoist_sync_enabled, todoist_auto_sync, todoist_sync_frequency')
      .eq('id', userId)
      .single()

    if (!user) return

    // Stop existing sync
    this.stopUserSync(userId)

    // Start new sync if enabled
    if (user.todoist_api_token && user.todoist_sync_enabled && user.todoist_auto_sync) {
      this.startUserSync(userId, user.todoist_api_token, user.todoist_sync_frequency || 5)
    }
  }
}

// Export singleton instance
export const syncScheduler = SyncScheduler.getInstance()