// Pure helpers for shaping the email_thread_tasks link rows into the maps the
// Today view / clients consume. Kept side-effect-free so it can be unit tested.

export interface EmailThreadTaskRow {
  task_id: string;
  thread_id: string;
  generated_by?: string | null;
  rationale?: string | null;
  public?: boolean | null;
}

export interface EmailSenderRow {
  thread_id: string;
  email_address?: string | null;
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
  /** task_id -> sender email address of the source thread (the "From:") */
  senderByTaskId: Record<string, string>;
}

export function buildTaskLinkMaps(
  rows: EmailThreadTaskRow[] | null | undefined,
  senderRows?: EmailSenderRow[] | null,
): TaskLinkMaps {
  const links: TaskLinkMaps["links"] = {};
  const aiCreated: TaskLinkMaps["aiCreated"] = {};
  const publicByTaskId: TaskLinkMaps["publicByTaskId"] = {};
  const senderByTaskId: TaskLinkMaps["senderByTaskId"] = {};

  // thread_id -> first "from" email address we see for that thread.
  const senderByThreadId: Record<string, string> = {};
  for (const row of senderRows || []) {
    if (!row || typeof row.thread_id !== "string") continue;
    const email = (row.email_address || "").trim();
    if (!email) continue;
    if (!senderByThreadId[row.thread_id]) {
      senderByThreadId[row.thread_id] = email;
    }
  }

  for (const row of rows || []) {
    if (!row || typeof row.task_id !== "string") continue;
    links[row.task_id] = row.thread_id;
    publicByTaskId[row.task_id] = row.public === true;
    const sender = senderByThreadId[row.thread_id];
    if (sender) senderByTaskId[row.task_id] = sender;
    if (row.generated_by === "ai") {
      aiCreated[row.task_id] = {
        threadId: row.thread_id,
        generatedBy: row.generated_by,
        rationale: row.rationale ?? null,
      };
    }
  }

  return { links, aiCreated, publicByTaskId, senderByTaskId };
}
