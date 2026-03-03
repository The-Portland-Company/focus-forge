import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    // Use service role to bypass RLS temporarily for testing
    const supabase = await createServiceClient()
    
    // Get organizations count
    const { count: orgCount, error: orgError } = await supabase
      .from('organizations')
      .select('*', { count: 'exact', head: true })
    
    // Get projects count  
    const { count: projectCount, error: projectError } = await supabase
      .from('projects')
      .select('*', { count: 'exact', head: true })
      
    // Get tasks count
    const { count: taskCount, error: taskError } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      
    // Get profiles count
    const { count: profileCount, error: profileError } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      
    // Get user_organizations for spencerdhill@protonmail.com
    const { data: userOrgs, error: userOrgsError } = await supabase
      .from('user_organizations')
      .select('*')
      .eq('user_id', 'f7c172d9-f2de-43a0-a984-8f6b7b17c70d')
      .limit(5)
    
    return NextResponse.json({
      counts: {
        organizations: orgCount,
        projects: projectCount,
        tasks: taskCount,
        profiles: profileCount
      },
      errors: {
        organizations: orgError?.message,
        projects: projectError?.message,
        tasks: taskError?.message,
        profiles: profileError?.message,
        userOrgs: userOrgsError?.message
      },
      userOrganizations: {
        count: userOrgs?.length || 0,
        sample: userOrgs
      }
    })
  } catch (error) {
    console.error('Test data error:', error)
    return NextResponse.json({ 
      error: 'Test data error', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 })
  }
}