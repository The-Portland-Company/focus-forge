"use client"

import { useRef, useState } from 'react'
import { TaskModal } from '@/components/task-modal'
import { AddProjectModal } from '@/components/add-project-modal'
import { AddTagModal } from '@/components/add-tag-modal'
import { Database, Project, Tag, Task } from '@/lib/types'

interface AddTaskStackProps {
  isOpen: boolean
  onClose: () => void
  data: Database
  onAddTask: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'> | Partial<Task>) => Promise<Task | null>
  onDataRefresh?: () => void
  defaultProjectId?: string
  onAddProject: (projectData: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Project | null>
  onAddTag: (tagData: Omit<Tag, 'id'>) => Promise<Tag | null>
}

export function AddTaskStack({
  isOpen,
  onClose,
  data,
  onAddTask,
  onDataRefresh,
  defaultProjectId,
  onAddProject,
  onAddTag
}: AddTaskStackProps) {
  const [stackedTaskSeed, setStackedTaskSeed] = useState<string | null>(null)
  const [stackedProjectSeed, setStackedProjectSeed] = useState<{ name: string; organizationId: string } | null>(null)
  const [stackedTagSeed, setStackedTagSeed] = useState<string | null>(null)
  const dependencyResolverRef = useRef<((task: Task | null) => void) | null>(null)
  const projectResolverRef = useRef<((project: Project | null) => void) | null>(null)
  const tagResolverRef = useRef<((tag: Tag | null) => void) | null>(null)

  const hasStack = !!stackedTaskSeed || !!stackedProjectSeed || !!stackedTagSeed

  const requestNewDependencyTask = (seedName?: string) => {
    return new Promise<Task | null>((resolve) => {
      dependencyResolverRef.current = resolve
      setStackedTaskSeed(seedName || '')
    })
  }

  const requestNewProject = (seedName: string, organizationId: string) => {
    return new Promise<Project | null>((resolve) => {
      projectResolverRef.current = resolve
      setStackedProjectSeed({ name: seedName, organizationId })
    })
  }

  const requestNewTag = (seedName: string) => {
    return new Promise<Tag | null>((resolve) => {
      tagResolverRef.current = resolve
      setStackedTagSeed(seedName)
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="relative w-full h-full flex items-center justify-center">
        <TaskModal
          isOpen={isOpen}
          onClose={onClose}
          data={data}
          onSave={onAddTask}
          onDataRefresh={onDataRefresh}
          defaultProjectId={defaultProjectId}
          onRequestNewDependencyTask={requestNewDependencyTask}
          onRequestNewProject={requestNewProject}
          onRequestNewTag={requestNewTag}
          renderInStack
          stackZIndex={60}
          stackStyle={hasStack ? { transform: 'translateX(-16px) translateY(8px) scale(0.98)' } : undefined}
        />

        {stackedTaskSeed !== null && (
          <TaskModal
            isOpen
            onClose={() => {
              setStackedTaskSeed(null)
              dependencyResolverRef.current?.(null)
            }}
            data={data}
            onSave={async (taskData) => {
              const created = await onAddTask(taskData)
              dependencyResolverRef.current?.(created ?? null)
              setStackedTaskSeed(null)
            }}
            onDataRefresh={onDataRefresh}
            defaultProjectId={defaultProjectId}
            initialName={stackedTaskSeed || undefined}
            renderInStack
            stackZIndex={70}
            stackStyle={{ transform: 'translateX(16px) translateY(-8px) scale(1)' }}
          />
        )}

        {stackedProjectSeed && (
          <AddProjectModal
            isOpen
            onClose={() => {
              setStackedProjectSeed(null)
              projectResolverRef.current?.(null)
            }}
            organizationId={stackedProjectSeed.organizationId}
            onAddProject={async (projectData) => {
              const created = await onAddProject(projectData)
              projectResolverRef.current?.(created ?? null)
              setStackedProjectSeed(null)
            }}
            renderInStack
            stackZIndex={70}
            stackStyle={{ transform: 'translateX(16px) translateY(-8px) scale(1)' }}
          />
        )}

        {stackedTagSeed !== null && (
          <AddTagModal
            isOpen
            onClose={() => {
              setStackedTagSeed(null)
              tagResolverRef.current?.(null)
            }}
            onAddTag={async (tagData) => {
              const created = await onAddTag(tagData)
              tagResolverRef.current?.(created ?? null)
              setStackedTagSeed(null)
              return created
            }}
            initialName={stackedTagSeed || undefined}
            renderInStack
            stackZIndex={70}
            stackStyle={{ transform: 'translateX(16px) translateY(-8px) scale(1)' }}
          />
        )}
      </div>
    </div>
  )
}
