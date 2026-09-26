'use client';

import { TaskSourceIcon } from '@/components/task-source-icon';

interface TaskGoalRowProps {
  id: string;
  name: string;
  completed: boolean;
  source?: string | null;
  sourceUrl?: string | null;
}

export function TaskGoalRow({ id, name, completed, source, sourceUrl }: TaskGoalRowProps) {
  return (
    <li
      key={id}
      className="flex items-center gap-3 px-4 py-3 text-sm"
    >
      <span aria-hidden>{completed ? "☑" : "☐"}</span>
      <TaskSourceIcon source={source} sourceUrl={sourceUrl} />
      <span className={completed ? "text-muted-foreground line-through" : ""}>
        {name}
      </span>
    </li>
  );
}
