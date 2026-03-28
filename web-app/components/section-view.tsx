"use client"

import { useState, useEffect } from 'react'
import { ChevronRight, ChevronDown, Edit, Trash2, Plus, GripVertical } from 'lucide-react'
import { Section, Task, Database } from '@/lib/types'
import { TaskList } from './task-list'

interface SectionViewProps {
  section: Section
  tasks: Task[]
  allTasks: Task[]
  database: Database
  level?: number
  priorityColor?: string
  currentUserId?: string
  completedAccordionKey?: string
  revealActionsOnHover?: boolean
  dueDateLayout?: "inline" | "below" | "right"
  bulkSelectMode?: boolean
  selectedTaskIds?: Set<string>
  loadingTaskIds?: Set<string>
  animatingOutTaskIds?: Set<string>
  optimisticCompletedIds?: Set<string>
  enableDueDateQuickEdit?: boolean
  onTaskUpdate?: (taskId: string, updates: Partial<Task>) => Promise<void> | void
  onTaskToggle: (taskId: string) => void
  onTaskEdit: (task: Task) => void
  onTaskDelete: (taskId: string) => void
  onTaskSelect?: (taskId: string, event?: React.MouseEvent) => void
  onSectionEdit: (section: Section) => void
  onSectionDelete: (sectionId: string) => void
  onAddTask: (section: Section) => void
  onAddSection: (parentId: string) => void
  onAddSectionAfter?: (section: Section) => void
  onTaskDrop: (taskId: string, sectionId: string) => void
  onSectionReorder: (sectionId: string, newOrder: number) => void
  userId: string
}

export function SectionView({
  section,
  tasks,
  allTasks,
  database,
  level = 0,
  priorityColor,
  currentUserId,
  completedAccordionKey,
  revealActionsOnHover = false,
  dueDateLayout = "inline",
  bulkSelectMode = false,
  selectedTaskIds,
  loadingTaskIds,
  animatingOutTaskIds,
  optimisticCompletedIds,
  enableDueDateQuickEdit = false,
  onTaskUpdate,
  onTaskToggle,
  onTaskEdit,
  onTaskDelete,
  onTaskSelect,
  onSectionEdit,
  onSectionDelete,
  onAddTask,
  onAddSection,
  onAddSectionAfter,
  onTaskDrop,
  onSectionReorder,
  userId
}: SectionViewProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  
  // Load collapsed state from user preferences
  useEffect(() => {
    const preference = database.userSectionPreferences?.find(
      pref => pref.userId === userId && pref.sectionId === section.id
    )
    if (preference) {
      setIsCollapsed(preference.isCollapsed)
    }
  }, [database.userSectionPreferences, userId, section.id])
  
  // Get tasks for this section
  const sectionTasks = tasks.filter(task => {
    const taskSections = database.taskSections?.filter(ts => ts.taskId === task.id) || []
    return taskSections.some(ts => ts.sectionId === section.id) || task.sectionId === section.id || (task as any).section_id === section.id
  })
  
  // Get child sections
  const childSections = database.sections?.filter(s => s.parentId === section.id)
    .sort((a, b) => (a.order || 0) - (b.order || 0)) || []
  
  const handleToggleCollapse = async () => {
    const newCollapsed = !isCollapsed
    setIsCollapsed(newCollapsed)
    
    // Save preference
    try {
      await fetch('/api/user-section-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          sectionId: section.id,
          isCollapsed: newCollapsed
        })
      })
    } catch (error) {
      console.error('Failed to save section preference:', error)
    }
  }
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    
    const taskId = e.dataTransfer.getData('taskId')
    if (taskId) {
      onTaskDrop(taskId, section.id)
    }
  }
  
  return (
    <div 
      className={`${level > 0 ? 'ml-6' : ''} group/section`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Section Header */}
      <div 
        className={`flex items-center gap-2 p-2 rounded-lg hover:bg-zinc-800/50 group transition-all cursor-pointer ${
          dragOver ? 'bg-zinc-800/50 ring-2 ring-[var(--theme-primary)]' : ''
        }`}
        onClick={handleToggleCollapse}
      >
        <button className="p-1">
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4 text-zinc-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-zinc-400" />
          )}
        </button>
        
        <div className="flex items-center gap-2 flex-1">
          <span className="text-lg">{section.icon}</span>
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: section.color }}
          />
          <span className="font-medium text-white">{section.name}</span>
          <span className="text-sm text-zinc-500">
            ({sectionTasks.length})
          </span>
        </div>
        
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onAddTask(section)
            }}
            className="p-1 hover:bg-zinc-700 rounded transition-colors"
            title="Add task"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onSectionEdit(section)
            }}
            className="p-1 hover:bg-zinc-700 rounded transition-colors"
            title="Edit section"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onSectionDelete(section.id)
            }}
            className="p-1 hover:bg-zinc-700 rounded transition-colors text-red-400"
            title="Delete section"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <GripVertical className="w-4 h-4 text-zinc-500 cursor-move" />
        </div>
      </div>
      
      {/* Section Content */}
      {!isCollapsed && (
        <div className="ml-6 mt-2">
          {/* Section Description */}
          {section.description && (
            <p className="text-sm text-zinc-400 mb-3 ml-6">
              {section.description}
            </p>
          )}
          
          {/* Tasks in this section */}
          {sectionTasks.length > 0 && (
            <div className="mb-4">
              <TaskList
                tasks={sectionTasks}
                allTasks={allTasks}
                projects={database.projects}
                currentUserId={currentUserId}
                priorityColor={priorityColor}
                showCompleted={database.settings?.showCompletedTasks ?? true}
                completedAccordionKey={completedAccordionKey ? `${completedAccordionKey}-section-${section.id}` : undefined}
                revealActionsOnHover={revealActionsOnHover}
                dueDateLayout={dueDateLayout}
                uniformDueBadgeWidth={dueDateLayout === "inline"}
                bulkSelectMode={bulkSelectMode}
                selectedTaskIds={selectedTaskIds}
                loadingTaskIds={loadingTaskIds}
                animatingOutTaskIds={animatingOutTaskIds}
                optimisticCompletedIds={optimisticCompletedIds}
                enableDueDateQuickEdit={enableDueDateQuickEdit}
                onTaskUpdate={onTaskUpdate}
                onTaskToggle={onTaskToggle}
                onTaskEdit={onTaskEdit}
                onTaskDelete={onTaskDelete}
                onTaskSelect={onTaskSelect}
              />
            </div>
          )}

          <div className="mb-2 flex h-0 w-full items-center justify-center overflow-visible">
            <div className="pointer-events-auto flex items-center gap-2 rounded-lg opacity-0 transition-all duration-200 translate-y-2 group-hover/section:translate-y-0 group-hover/section:opacity-100">
              {onAddSectionAfter && (
                <button
                  onClick={() => onAddSectionAfter(section)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-500 transition-colors group-hover/section:bg-zinc-900/50 group-hover/section:text-zinc-300"
                  type="button"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  <span className="whitespace-nowrap">Add Section</span>
                </button>
              )}
              <button
                onClick={() => onAddTask(section)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-500 transition-colors group-hover/section:bg-zinc-900/50 group-hover/section:text-zinc-300"
                type="button"
              >
                <Plus className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">Add Task</span>
              </button>
            </div>
          </div>
          
          {/* Child sections */}
          {childSections.map(childSection => (
            <SectionView
              key={childSection.id}
              section={childSection}
              tasks={tasks}
              allTasks={allTasks}
              database={database}
              level={level + 1}
              priorityColor={priorityColor}
              currentUserId={currentUserId}
              completedAccordionKey={completedAccordionKey}
              revealActionsOnHover={revealActionsOnHover}
              dueDateLayout={dueDateLayout}
              bulkSelectMode={bulkSelectMode}
              selectedTaskIds={selectedTaskIds}
              loadingTaskIds={loadingTaskIds}
              animatingOutTaskIds={animatingOutTaskIds}
              optimisticCompletedIds={optimisticCompletedIds}
              enableDueDateQuickEdit={enableDueDateQuickEdit}
              onTaskUpdate={onTaskUpdate}
              onTaskToggle={onTaskToggle}
              onTaskEdit={onTaskEdit}
              onTaskDelete={onTaskDelete}
              onTaskSelect={onTaskSelect}
              onSectionEdit={onSectionEdit}
              onSectionDelete={onSectionDelete}
              onAddTask={onAddTask}
              onAddSection={onAddSection}
              onAddSectionAfter={onAddSectionAfter}
              onTaskDrop={onTaskDrop}
              onSectionReorder={onSectionReorder}
              userId={userId}
            />
          ))}
        </div>
      )}
    </div>
  )
}
