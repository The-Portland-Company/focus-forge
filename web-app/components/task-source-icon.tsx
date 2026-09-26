'use client';

import { useState } from 'react';
import { getTaskSource } from '@/lib/task-sources';

interface TaskSourceIconProps {
  source?: string | null;
  sourceUrl?: string | null;
  className?: string;
}

export function TaskSourceIcon({
  source,
  sourceUrl,
  className = '',
}: TaskSourceIconProps) {
  const [imageError, setImageError] = useState(false);

  const taskSource = getTaskSource(source);
  if (!taskSource) return null;

  const baseClasses = 'mr-1.5 inline-flex h-3.5 w-3.5 shrink-0 -translate-y-px items-center align-middle';
  const classes = className ? `${baseClasses} ${className}` : baseClasses;

  const icon = imageError ? (
    <div
      className="w-full h-full rounded-full flex items-center justify-center text-white text-[6px] font-bold"
      style={{ backgroundColor: '#71717a' }}
      title={`Created by ${taskSource.label}`}
      aria-label={`Created by ${taskSource.label}`}
    >
      {taskSource.initials}
    </div>
  ) : (
    <img
      src={taskSource.logo}
      alt=""
      className="w-full h-full rounded"
      onError={() => setImageError(true)}
      title={`Created by ${taskSource.label}`}
    />
  );

  if (sourceUrl) {
    return (
      <a
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={classes}
        onClick={(e) => e.stopPropagation()}
        title={`Created by ${taskSource.label}`}
        aria-label={`Created by ${taskSource.label}`}
      >
        {icon}
      </a>
    );
  }

  return <span className={classes}>{icon}</span>;
}
