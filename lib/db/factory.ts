import { DatabaseAdapter } from './types'
import { FileAdapter } from './file-adapter'
import { SupabaseAdapter } from './supabase-adapter'

let adapter: DatabaseAdapter | null = null

export function getDatabaseAdapter(): DatabaseAdapter {
  if (!adapter) {
    // Check if we should use Supabase (only when explicitly enabled)
    const useSupabase = process.env.USE_SUPABASE === 'true'
    
    adapter = useSupabase ? new SupabaseAdapter() : new FileAdapter()
  }
  
  return adapter
}