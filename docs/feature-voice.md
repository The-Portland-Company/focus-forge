# Voice-to-Tasks Feature

Status: shipped in [PR #5](https://github.com/s3w47m88/focus-forge/pull/5) on branch `claude/condescending-boyd-42b191`. Awaiting merge to `production` for Railway deploy.

## What it does

A persistent floating mic button (bottom-right, all authenticated views) that:

1. Records the user's voice via `MediaRecorder` (opus/webm, 2-minute cap, live level meter).
2. Transcribes the audio with OpenAI Whisper (`whisper-1`).
3. Extracts discrete actionable tasks via OpenAI `gpt-4o-mini` using a strict JSON schema. The model can also pick the target project by matching a project name spoken in the transcript against the user's project list.
4. Creates each task via the existing `POST /api/tasks`, scoped to the current project (route `/projects-{id}`) or the project named in speech.
5. Shows a 5-second Undo banner; clicking Undo bulk-`DELETE`s every just-created task.
6. Highlights the new task rows amber (via existing `data-task-id` attribute) and fades the highlight to transparent over 30 seconds.

## Architecture decisions

- **OpenAI for both transcription and extraction.** Original plan named Claude for extraction, but there was no Anthropic key in 1Password and `OPENAI_API_KEY` was already wired in `/api/ai-planner/*` and on Railway. Switched to `gpt-4o-mini` with `response_format.json_schema` for reliable structured output.
- **No highlight context / no `[view]/page.tsx` edit.** Task rows already render with `data-task-id={task.id}` in `components/task-list.tsx` and `components/project-section-board.tsx`. The FAB queries the DOM directly after creation — zero churn in the 5,400-line view page.
- **Imperative undo banner.** The existing `ToastContext` is text-only; rather than expand it, the FAB renders a small fixed-position banner with an Undo button via DOM. Self-removes after 5 s.
- **Fire-and-forget creation** (per user instruction). Tasks are POSTed sequentially, results collected, undo offered.
- **Settings "AI Providers" UI deferred.** Env vars are sufficient for v1. Flag for a follow-up PR if multi-provider UI is wanted.

## Files added

| Path | Purpose |
|---|---|
| `web-app/lib/voice/use-recorder.ts` | `useRecorder()` hook — MediaRecorder wrapper, RMS level meter via `AnalyserNode`, 2-min cap, cleanup on unmount. |
| `web-app/app/api/voice/transcribe/route.ts` | Auth-gated proxy to OpenAI `audio/transcriptions` (whisper-1). Accepts multipart `audio` blob. |
| `web-app/app/api/voice/tasks-from-text/route.ts` | Auth-gated extractor. POST `{ transcript, currentProjectId, projects }` → `{ projectId, tasks[] }`. Strict JSON schema; today's date injected into prompt for relative dates. |
| `web-app/components/voice-task-button.tsx` | The FAB. Phases: `idle → recording → transcribing → extracting → creating → done`. Renders inline waveform during recording, transcript preview during processing, success toast + Undo banner + 30s row-highlight on completion. |

## Files modified

- `web-app/app/layout.tsx` — mounts `<VoiceTaskButton />` inside `<ToastProvider>`. Hidden when not authenticated.
- Root `/Users/spencerhill/Sites/focus-forge/.env` — added `OPENAI_API_KEY` and `DEEPSEEK_API_KEY` for local dev (pulled from 1Password; not committed).

## Environment

- Local: root `.env` (`OPENAI_API_KEY`, `DEEPSEEK_API_KEY` — DeepSeek unused in v1 but available for future provider switch).
- Railway: `OPENAI_API_KEY` already set on the `app` service (production env). No new variables required.

## Open items / follow-ups

1. **Settings → AI Providers UI** (Anthropic, OpenAI, DeepSeek key entry; provider selector for transcription vs. extraction). Not implemented in this PR.
2. **Highlight refresh edge case.** If the current view doesn't auto-refetch after `POST /api/tasks`, the new rows may not be in the DOM when the highlight pass runs. The component retries the highlight up to 10 × every 400 ms after a 250 ms initial delay; if your view caches its task list aggressively, you may need to dispatch a refresh on the `voice-tasks:created` window event.
3. **Mobile.** Untested in the Capacitor iOS build. WebView `getUserMedia` requires the `NSMicrophoneUsageDescription` plist entry and a runtime permission prompt. Audit before mobile release.
4. **Streaming transcription / partial results.** Not implemented; everything is request/response.
5. **Confirm step before save.** User asked for fire-and-forget — confirm is intentionally absent. v2 could add an editable review modal.

## Test plan

- Click mic FAB on `/projects-{id}` → grant mic → speak "Add task buy milk, add task call the dentist tomorrow" → Stop.
- Expect: success toast "Created 2 tasks in {Project}", undo banner appears bottom-right above the FAB, both rows briefly amber and fade over ~30s.
- Click Undo within 5s → tasks DELETEd, info toast.
- Speak "Add task X to my Inbox project" while on a different project → tasks should land in the matched project.
- Empty/garbled transcript → info toast, no tasks.
- Deny mic permission → error toast.

## Deploy

- PR #5 → merge to `production` → Railway redeploys the `app` service automatically.
- Verify `/api/voice/transcribe` and `/api/voice/tasks-from-text` return 401 unauthenticated and 200 with valid session.
