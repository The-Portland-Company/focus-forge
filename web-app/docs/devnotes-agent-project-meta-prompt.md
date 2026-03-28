# DevNotes Agent Prompt

Update the Focus Forge integration so DevNotes metadata is never appended to a project's human-readable description.

Rules:
- Put the raw token in the dedicated `devnotes_meta` project field instead.
- The `description` field must contain only human-readable project description content.
- When sending project create or update payloads, send:
  - `description`: the clean user-facing description text only
  - `devnotesMeta` or `devnotes_meta`: the full raw token, eg. `[DEVNOTES_META:...]`
- If you receive a description string that already contains `[DEVNOTES_META:...]`, extract that token, move it into `devnotes_meta`, and remove it from `description` before saving.
- Preserve the token exactly. Do not decode it, rewrite it, summarize it, or merge it into prose.

Example payload shape:

```json
{
  "name": "Project name",
  "description": "User-facing description only",
  "devnotesMeta": "[DEVNOTES_META:eyJraW5kIjoicmVwb3J0In0]"
}
```
