-- Task dependencies: a task can be blocked by one or more other tasks. The
-- app already models this in-memory as Task.dependsOn (see lib/dependency-utils
-- and the drag-to-link affordance in the task list) but there was no column to
-- persist it, so dependencies were silently dropped on save. This adds the
-- backing store as an array of task ids this task depends on (is blocked by).
alter table public.tasks
  add column if not exists depends_on uuid[] not null default '{}';
