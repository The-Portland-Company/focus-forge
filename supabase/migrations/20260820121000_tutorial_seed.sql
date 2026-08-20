-- Seed baseline tutorial content so the system is demonstrable end-to-end:
-- one Core chapter, one Nuance chapter, sections, and two contextual tooltips
-- anchored to real UI (`data-tutorial-id="create-menu"` and `"ai-assistant"`).
-- Idempotent via slug / anchor_key conflict targets.

BEGIN;

-- ---- Core chapter: Getting Started ---------------------------------------
INSERT INTO public.tutorial_chapters (slug, title, summary, icon, topic, order_index, published)
VALUES ('getting-started', 'Getting Started',
        'Your first projects, tasks, and how the app is organized.',
        'rocket', 'core', 0, true)
ON CONFLICT (slug) DO UPDATE
  SET title = EXCLUDED.title, summary = EXCLUDED.summary,
      topic = EXCLUDED.topic, order_index = EXCLUDED.order_index,
      published = EXCLUDED.published;

INSERT INTO public.tutorial_sections (chapter_id, slug, title, body, estimated_minutes, order_index)
SELECT c.id, v.slug, v.title, v.body::jsonb, v.mins, v.ord
FROM public.tutorial_chapters c
CROSS JOIN (VALUES
  ('welcome', 'Welcome to Focus: Forge',
   '{"markdown":"Focus: Forge organizes your work into **organizations**, **projects**, **task lists**, and **tasks**.\n\nThis short tutorial walks you through the essentials, then the power features. You can stop anytime — your progress is saved and you can pick up right where you left off.\n\n### What you will learn\n- Creating projects and tasks\n- Organizing work with task lists\n- Using the AI assistant"}',
   2, 0),
  ('create-first-task', 'Create your first task',
   '{"markdown":"Use the **+ create** button anywhere in the app to add a task, task list, or section.\n\nA task can hold a due date, priority (1–4), tags, subtasks, reminders, and attachments — add only what you need.\n\n- Give the task a clear, action-oriented name\n- Set a due date if it matters\n- Drop it into the right project"}',
   3, 1),
  ('organize-projects', 'Organize with projects & task lists',
   '{"markdown":"**Projects** live inside organizations; **task lists** group related tasks inside a project.\n\nDrag to reorder, favorite the projects you touch daily, and archive the ones you are done with. Everything stays bookmarkable — the URL updates as you navigate."}',
   3, 2)
) AS v(slug, title, body, mins, ord)
WHERE c.slug = 'getting-started'
ON CONFLICT (chapter_id, slug) DO UPDATE
  SET title = EXCLUDED.title, body = EXCLUDED.body,
      estimated_minutes = EXCLUDED.estimated_minutes,
      order_index = EXCLUDED.order_index;

-- ---- Nuance chapter: AI power features -----------------------------------
INSERT INTO public.tutorial_chapters (slug, title, summary, icon, topic, order_index, published)
VALUES ('ai-power-features', 'AI Power Features',
        'Let the assistant plan, refine, and act on your work.',
        'sparkles', 'nuance', 0, true)
ON CONFLICT (slug) DO UPDATE
  SET title = EXCLUDED.title, summary = EXCLUDED.summary,
      topic = EXCLUDED.topic, order_index = EXCLUDED.order_index,
      published = EXCLUDED.published;

INSERT INTO public.tutorial_sections (chapter_id, slug, title, body, estimated_minutes, order_index)
SELECT c.id, v.slug, v.title, v.body::jsonb, v.mins, v.ord
FROM public.tutorial_chapters c
CROSS JOIN (VALUES
  ('meet-the-assistant', 'Meet the assistant',
   '{"markdown":"The **AI assistant** (the sparkle button, lower-right) answers questions about the page you are on and can create or update tasks for you.\n\nAsk it things like *\"What is due this week?\"* or *\"Add a task to follow up with Sam on Friday.\"*"}',
   2, 0),
  ('smart-planning', 'Smart planning & refinement',
   '{"markdown":"Beyond answering, the assistant can **plan your day** and **refine tasks** — sharpening vague names, suggesting estimates, and grouping related work.\n\nIt runs on a multi-provider model chain, so it keeps working even if one provider is unavailable."}',
   3, 1)
) AS v(slug, title, body, mins, ord)
WHERE c.slug = 'ai-power-features'
ON CONFLICT (chapter_id, slug) DO UPDATE
  SET title = EXCLUDED.title, body = EXCLUDED.body,
      estimated_minutes = EXCLUDED.estimated_minutes,
      order_index = EXCLUDED.order_index;

-- ---- Contextual tooltips --------------------------------------------------
INSERT INTO public.tutorial_tooltips (section_id, anchor_key, title, body, placement, order_index)
SELECT s.id, 'create-menu', 'Create anything here',
       'Add a task, task list, or section from this button. It is available throughout the app.',
       'bottom', 0
FROM public.tutorial_sections s
JOIN public.tutorial_chapters c ON c.id = s.chapter_id
WHERE c.slug = 'getting-started' AND s.slug = 'create-first-task'
ON CONFLICT (anchor_key) DO UPDATE
  SET title = EXCLUDED.title, body = EXCLUDED.body,
      section_id = EXCLUDED.section_id, placement = EXCLUDED.placement;

INSERT INTO public.tutorial_tooltips (section_id, anchor_key, title, body, placement, order_index)
SELECT s.id, 'ai-assistant', 'Your AI assistant',
       'Ask questions about this page or have the assistant create and update tasks for you.',
       'left', 1
FROM public.tutorial_sections s
JOIN public.tutorial_chapters c ON c.id = s.chapter_id
WHERE c.slug = 'ai-power-features' AND s.slug = 'meet-the-assistant'
ON CONFLICT (anchor_key) DO UPDATE
  SET title = EXCLUDED.title, body = EXCLUDED.body,
      section_id = EXCLUDED.section_id, placement = EXCLUDED.placement;

COMMIT;
