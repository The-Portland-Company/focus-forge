'use client'

import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { TimeBlock, Task } from '@/lib/types'
import { format, startOfDay, addDays, parseISO, isSameDay } from 'date-fns'
import { Trash2, Plus, Clock, Calendar, GripVertical } from 'lucide-react'
import { useToast } from '@/contexts/ToastContext'
import { CalendarChat } from '@/components/calendar-chat'

export default function CalendarPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null)
  const [draggedTask, setDraggedTask] = useState<Task | null>(null)
  const [dragOverBlock, setDragOverBlock] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  // Group time blocks by date
  const groupedBlocks = timeBlocks.reduce((acc, block) => {
    const date = format(parseISO(block.startTime), 'yyyy-MM-dd')
    if (!acc[date]) acc[date] = []
    acc[date].push(block)
    return acc
  }, {} as Record<string, TimeBlock[]>)

  // Generate dates for the next 7 days
  const dates = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(startOfDay(new Date()), i)
    return format(date, 'yyyy-MM-dd')
  })

  useEffect(() => {
    fetchTimeBlocks()
    fetchTasks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const fetchTimeBlocks = async () => {
    try {
      const res = await fetch('/api/time-blocks')
      if (res.ok) {
        const data = await res.json()
        setTimeBlocks(data.timeBlocks || [])
      }
    } catch (error) {
      console.error('Error fetching time blocks:', error)
      showToast('Failed to load calendar', 'error')
    } finally {
      setLoading(false)
    }
  }

  const fetchTasks = async () => {
    try {
      const res = await fetch('/api/tasks')
      if (res.ok) {
        const data = await res.json()
        setTasks(data.tasks || [])
      }
    } catch (error) {
      console.error('Error fetching tasks:', error)
    }
  }

  const handleCellEdit = async (blockId: string, field: string, value: any) => {
    try {
      const res = await fetch(`/api/time-blocks/${blockId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value })
      })

      if (res.ok) {
        const updated = await res.json()
        setTimeBlocks(prev => prev.map(b => b.id === blockId ? { ...b, ...updated } : b))
        showToast('Time block updated', 'success')
      }
    } catch (error) {
      console.error('Error updating time block:', error)
      showToast('Failed to update', 'error')
    }
    setEditingCell(null)
  }

  const handleAddTimeBlock = async (date: string) => {
    const startTime = new Date(`${date}T09:00:00`)
    const endTime = new Date(`${date}T10:00:00`)

    try {
      const res = await fetch('/api/time-blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          title: 'New Time Block',
          description: ''
        })
      })

      if (res.ok) {
        const newBlock = await res.json()
        setTimeBlocks(prev => [...prev, newBlock])
        showToast('Time block created', 'success')
      }
    } catch (error) {
      console.error('Error creating time block:', error)
      showToast('Failed to create time block', 'error')
    }
  }

  const handleDeleteTimeBlock = async (blockId: string) => {
    try {
      const res = await fetch(`/api/time-blocks/${blockId}`, {
        method: 'DELETE'
      })

      if (res.ok) {
        setTimeBlocks(prev => prev.filter(b => b.id !== blockId))
        showToast('Time block deleted', 'success')
      }
    } catch (error) {
      console.error('Error deleting time block:', error)
      showToast('Failed to delete', 'error')
    }
  }

  const handleTaskDrop = async (blockId: string, taskId: string) => {
    try {
      const res = await fetch(`/api/time-blocks/${blockId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId })
      })

      if (res.ok) {
        fetchTimeBlocks()
        showToast('Task added to time block', 'success')
      }
    } catch (error) {
      console.error('Error adding task to time block:', error)
      showToast('Failed to add task', 'error')
    }
    setDraggedTask(null)
    setDragOverBlock(null)
  }

  const formatTime = (dateString: string) => {
    return format(parseISO(dateString), 'h:mm a')
  }

  const calculateDuration = (start: string, end: string) => {
    const startTime = parseISO(start)
    const endTime = parseISO(end)
    const diff = (endTime.getTime() - startTime.getTime()) / (1000 * 60)
    const hours = Math.floor(diff / 60)
    const minutes = diff % 60
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-100">Calendar</h1>
        <p className="text-gray-400 mt-2">Manage your time blocks and schedule</p>
      </div>

      <CalendarChat onUpdate={fetchTimeBlocks} />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Task List for Dragging */}
        <div className="lg:col-span-1">
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-100 mb-4">Unscheduled Tasks</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {tasks.filter(t => !t.completed).map(task => (
                <div
                  key={task.id}
                  draggable
                  onDragStart={() => setDraggedTask(task)}
                  onDragEnd={() => setDraggedTask(null)}
                  className="bg-gray-700 p-3 rounded cursor-move hover:bg-gray-600 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <GripVertical className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-200">{task.name}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Calendar Table */}
        <div className="lg:col-span-3 space-y-6">
          {dates.map(date => {
            const dayBlocks = groupedBlocks[date] || []
            const dateObj = parseISO(date)
            const isToday = isSameDay(dateObj, new Date())

            return (
              <div key={date} className="bg-gray-800 rounded-lg overflow-hidden">
                <div className={`px-4 py-3 border-b border-gray-700 ${isToday ? 'bg-blue-900/20' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <span className="font-semibold text-gray-100">
                        {format(dateObj, 'EEEE, MMMM d')}
                      </span>
                      {isToday && (
                        <span className="text-xs bg-blue-500 text-white px-2 py-1 rounded">Today</span>
                      )}
                    </div>
                    <button
                      onClick={() => handleAddTimeBlock(date)}
                      className="flex items-center gap-1 px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors text-sm"
                    >
                      <Plus className="w-4 h-4" />
                      Add Block
                    </button>
                  </div>
                </div>

                {dayBlocks.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-700">
                          <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase">Start</th>
                          <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase">End</th>
                          <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase">Title</th>
                          <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase">Description</th>
                          <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase">Duration</th>
                          <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase">Tasks</th>
                          <th className="px-4 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {dayBlocks.map((block) => (
                          <tr
                            key={block.id}
                            className={`border-b border-gray-700 hover:bg-gray-700/50 transition-colors ${
                              dragOverBlock === block.id ? 'bg-blue-500/20' : ''
                            }`}
                            onDragOver={(e) => {
                              e.preventDefault()
                              setDragOverBlock(block.id)
                            }}
                            onDragLeave={() => setDragOverBlock(null)}
                            onDrop={(e) => {
                              e.preventDefault()
                              if (draggedTask) {
                                handleTaskDrop(block.id, draggedTask.id)
                              }
                            }}
                          >
                            <td className="px-4 py-3">
                              {editingCell?.id === block.id && editingCell.field === 'startTime' ? (
                                <input
                                  ref={inputRef as any}
                                  type="time"
                                  defaultValue={format(parseISO(block.startTime), 'HH:mm')}
                                  onBlur={(e) => {
                                    const [hours, minutes] = e.target.value.split(':')
                                    const newTime = new Date(block.startTime)
                                    newTime.setHours(parseInt(hours), parseInt(minutes))
                                    handleCellEdit(block.id, 'startTime', newTime.toISOString())
                                  }}
                                  className="bg-gray-700 text-gray-100 px-2 py-1 rounded text-sm w-24"
                                  autoFocus
                                />
                              ) : (
                                <span
                                  onClick={() => setEditingCell({ id: block.id, field: 'startTime' })}
                                  className="text-gray-200 cursor-pointer hover:text-blue-400 text-sm"
                                >
                                  {formatTime(block.startTime)}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {editingCell?.id === block.id && editingCell.field === 'endTime' ? (
                                <input
                                  ref={inputRef as any}
                                  type="time"
                                  defaultValue={format(parseISO(block.endTime), 'HH:mm')}
                                  onBlur={(e) => {
                                    const [hours, minutes] = e.target.value.split(':')
                                    const newTime = new Date(block.endTime)
                                    newTime.setHours(parseInt(hours), parseInt(minutes))
                                    handleCellEdit(block.id, 'endTime', newTime.toISOString())
                                  }}
                                  className="bg-gray-700 text-gray-100 px-2 py-1 rounded text-sm w-24"
                                  autoFocus
                                />
                              ) : (
                                <span
                                  onClick={() => setEditingCell({ id: block.id, field: 'endTime' })}
                                  className="text-gray-200 cursor-pointer hover:text-blue-400 text-sm"
                                >
                                  {formatTime(block.endTime)}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {editingCell?.id === block.id && editingCell.field === 'title' ? (
                                <input
                                  ref={inputRef as any}
                                  type="text"
                                  defaultValue={block.title}
                                  onBlur={(e) => handleCellEdit(block.id, 'title', e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      handleCellEdit(block.id, 'title', e.currentTarget.value)
                                    }
                                  }}
                                  className="bg-gray-700 text-gray-100 px-2 py-1 rounded text-sm w-full"
                                  autoFocus
                                />
                              ) : (
                                <span
                                  onClick={() => setEditingCell({ id: block.id, field: 'title' })}
                                  className="text-gray-100 cursor-pointer hover:text-blue-400"
                                >
                                  {block.title}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {editingCell?.id === block.id && editingCell.field === 'description' ? (
                                <textarea
                                  ref={inputRef as any}
                                  defaultValue={block.description || ''}
                                  onBlur={(e) => handleCellEdit(block.id, 'description', e.target.value)}
                                  className="bg-gray-700 text-gray-100 px-2 py-1 rounded text-sm w-full resize-none"
                                  rows={2}
                                  autoFocus
                                />
                              ) : (
                                <span
                                  onClick={() => setEditingCell({ id: block.id, field: 'description' })}
                                  className="text-gray-400 cursor-pointer hover:text-blue-400 text-sm line-clamp-2"
                                >
                                  {block.description || 'Click to add description'}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1 text-gray-400 text-sm">
                                <Clock className="w-4 h-4" />
                                {calculateDuration(block.startTime, block.endTime)}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1">
                                {block.tasks?.map((task: any) => (
                                  <span
                                    key={task.id}
                                    className="bg-gray-700 text-gray-200 px-2 py-1 rounded text-xs"
                                  >
                                    {task.name}
                                  </span>
                                ))}
                                {(!block.tasks || block.tasks.length === 0) && (
                                  <span className="text-gray-500 text-xs">Drop tasks here</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <button
                                onClick={() => handleDeleteTimeBlock(block.id)}
                                className="text-red-400 hover:text-red-300 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-8 text-center text-gray-500">
                    <Clock className="w-12 h-12 mx-auto mb-3 text-gray-600" />
                    <p>No time blocks scheduled for this day</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}