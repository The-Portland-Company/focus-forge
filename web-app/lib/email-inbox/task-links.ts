// Pure helpers for shaping the email_thread_tasks link rows into the maps the
// Today view / clients consume. Kept side-effect-free so it can be unit tested.

export interface EmailThreadTaskRow {
  task_id: string;
  thread_id: string;
  generated_by?: string | null;
  rationale?: string | null;
  public?: boolean | null;
}

export interface TaskLinkMaps {
  /** task_id -> thread_id */
  links: Record<string, string>;
  /** task_id -> AI-origin metadata (only for AI-generated links) */
  aiCreated: Record<
    string,
    { threadId: string; generatedBy: string; rationale: string | null }
  >;
  /** task_id -> whether the email-linked task is marked public */
  publicByTaskId: Record<string, boolean>;
}

export function buildTaskLinkMaps(
  rows: EmailThreadTaskRow[] | null | undefined,
): TaskLinkMaps {
  const links: TaskLinkMaps["links"] = {};
  const aiCreated: TaskLinkMaps["aiCreated"] = {};
  const publicByTaskId: TaskLinkMaps["publicByTaskId"] = {};

  for (const row of rows || []) {
    if (!row || typeof row.task_id !== "string") continue;
    links[row.task_id] = row.thread_id;
    publicByTaskId[row.task_id] = row.public === true;
    if (row.generated_by === "ai") {
      aiCreated[row.task_id] = {
        threadId: row.thread_id,
        generatedBy: row.generated_by,
        rationale: row.rationale ?? null,
      };
    }
  }

  return { links, aiCreated, publicByTaskId };
}
