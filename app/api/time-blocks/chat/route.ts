import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SupabaseAdapter } from '@/lib/db/supabase-adapter'

// This endpoint processes natural language commands for time block management
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adapter = new SupabaseAdapter(supabase, user.id)
    const { message, apiKey } = await request.json()

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Claude API key is required' },
        { status: 400 }
      )
    }

    // Make request to Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 1024,
        messages: [
          {
            role: 'system',
            content: `You are a calendar assistant that helps manage time blocks. You can:
1. Create time blocks with start time, end time, title, and description
2. Update existing time blocks
3. Delete time blocks
4. Add or remove tasks from time blocks

Respond with JSON in this format:
{
  "action": "create" | "update" | "delete" | "add_task" | "remove_task" | "list",
  "data": {
    // For create:
    "startTime": "ISO 8601 datetime",
    "endTime": "ISO 8601 datetime",
    "title": "string",
    "description": "string",
    
    // For update:
    "id": "timeblock id",
    "updates": { /* fields to update */ },
    
    // For delete:
    "id": "timeblock id",
    
    // For add_task/remove_task:
    "timeBlockId": "timeblock id",
    "taskId": "task id",
    
    // For list:
    "startDate": "ISO 8601 date",
    "endDate": "ISO 8601 date"
  },
  "message": "Human-friendly confirmation message"
}`
          },
          {
            role: 'user',
            content: message
          }
        ]
      })
    })

    if (!response.ok) {
      throw new Error('Failed to get response from Claude')
    }

    const claudeResponse = await response.json()
    const assistantMessage = claudeResponse.content[0].text
    const parsed = JSON.parse(assistantMessage)

    // Execute the action
    let result
    switch (parsed.action) {
      case 'create':
        result = await adapter.createTimeBlock(parsed.data)
        break
      case 'update':
        result = await adapter.updateTimeBlock(parsed.data.id, parsed.data.updates)
        break
      case 'delete':
        await adapter.deleteTimeBlock(parsed.data.id)
        result = { success: true }
        break
      case 'add_task':
        await adapter.addTaskToTimeBlock(parsed.data.timeBlockId, parsed.data.taskId)
        result = { success: true }
        break
      case 'remove_task':
        await adapter.removeTaskFromTimeBlock(parsed.data.timeBlockId, parsed.data.taskId)
        result = { success: true }
        break
      case 'list':
        result = await adapter.getTimeBlocks(parsed.data.startDate, parsed.data.endDate)
        break
      default:
        throw new Error(`Unknown action: ${parsed.action}`)
    }

    return NextResponse.json({
      action: parsed.action,
      result,
      message: parsed.message
    })
  } catch (error) {
    console.error('Error processing chat message:', error)
    return NextResponse.json(
      { error: 'Failed to process chat message' },
      { status: 500 }
    )
  }
}