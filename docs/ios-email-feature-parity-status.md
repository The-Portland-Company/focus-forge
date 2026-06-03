# iOS Email Feature Parity — Implementation Status

> **Companion doc to `ios-email-feature-parity.md`.** Tracks what's actually shipped vs the spec.
> **Source of truth for next agent:** `/Users/spencerhill/Sites/focus-forge/focus-forge-ios-app/docs/SESSION-HANDOFF.md`
> **Last updated:** 2026-06-03

---

## TL;DR

All three phases of the parity spec are **merged into `production`** on `focus-forge-ios-app`. The app builds, runs in the iOS 17 simulator (deployment target bumped to **iOS 26** to enable Liquid Glass), and shows real data when signed in.

TestFlight ship is **blocked by an expired Apple Developer Program membership** (renewal will also clear the App Store Connect agreement gate I hit during upload).

---

## Feature matrix vs spec

| # | Spec feature | Inbox surface | Today surface | Status |
|---|---|:---:|:---:|---|
| 1 | Email/thread list (scrollable) | ✅ | ❌ removed | Done |
| 2 | Unread/read visual state | ✅ | ❌ | Done |
| 3 | Unread/total count badges | ✅ | ❌ | Done |
| 4 | Context-specific empty states | ✅ | ❌ | Done |
| 5 | Selected-item highlight | ✅ | ❌ | Done |
| 6 | Unread gradient (profile color) | ❌ | ❌ | Skipped per V1 decision |
| 7 | Sender (From) w/ avatar + tooltip | ✅ | ❌ | Done; avatar uses initials, falls back to `person.fill` SF Symbol when sender has no name/email |
| 8 | Recipient (To) display | ✅ | ❌ | Done |
| 9 | CC line | ✅ detail | ❌ | Done in thread detail |
| 10 | Date and time per row | ✅ | ❌ | Done via `TaskDateBadgeFormatter` (`Jan. 1st, 2026 at 1:01 PM`) |
| 11 | Subject (normalized) | ✅ | ❌ | Done |
| 12 | AI summary text (sparkle) | ✅ | ❌ | Done |
| 13 | Email preview/excerpt | ✅ | ❌ | Done |
| 14 | AI confidence score | ✅ | ❌ | Done via `EmailConfidenceBadge` |
| 15 | Mailbox badge (deterministic color) | ✅ | ❌ | Done via `MailboxInitialsBadge` |
| 16 | Spam/quarantine badge | ✅ | ❌ | Done — distinct icons (spam: `exclamationmark.octagon.fill` red, quarantine: `shield.lefthalf.filled` orange) |
| 17 | Sort dropdown | ✅ | ❌ | Done (newest/oldest) |
| 18 | Filter tabs/dropdown | ✅ | ❌ | Done (All/Unread/Read/Spam/Quarantine) |
| 19 | Full-text search | ✅ | ❌ | Done — debounced `.searchable` |
| 20 | Advanced search syntax (16+ prefixes) | ✅ | ❌ | Done — `EmailSearchParser.swift` ports web tokenizer; parsed client-side, raw query forwarded to server |
| 21 | Search help modal + inline `/help` | ✅ | ❌ | Done — `EmailSearchHelpView` |
| 22 | Mailbox selector/filter | ✅ | ❌ | Done |
| 23 | Collapsible filter bar (persisted) | ✅ | ❌ | Done via `@AppStorage` |
| 24 | Manual refresh/sync | ✅ | ❌ | Done |
| 25 | Last-sync indicator (relative) | ✅ | ❌ | Done in `EmailMailboxStatusView` |
| 26 | Mailboxes modal | ✅ | ❌ | Done |
| 27 | Auto-sync polling (~30s) | ✅ | ❌ | Done — foreground-only via NotificationCenter observers in `EmailStore` |
| 28 | Convert email → task(s) | ✅ | ❌ | Done — context menu + swipe |
| 29 | Snooze (date picker) | ✅ | ❌ | Done — `EmailSnoozePickerView` (was Today-only; now wired on Email tab via swipe) |
| 30 | Delete / trash | ✅ | ❌ | Done with 30s undo |
| 31 | Archive | ✅ | ❌ | Done with 3s undo |
| 32 | Approve / Quarantine | ✅ | ❌ | Done via context menu / actions |
| 33 | Mark spam / Not spam (+ rule gen) | ✅ | ❌ | Done; "not spam" creates exception via `/spam-exceptions` |
| 34 | Mark as read toggle | ✅ | ❌ | Done — leading swipe |
| 35 | Queued action + undo toast | ✅ | ❌ | Done — `EmailStore.queueAction` + `UndoToastView` |
| 36 | Hover/swipe action buttons | ✅ | ❌ | Done — full swipe set |
| 37 | Inline split-pane detail | ❌ | ❌ | N/A on iPhone; might add in a future iPad pass |
| 38 | Thread modal / popout | ✅ | ❌ | Done — `EmailThreadDetailView` push-nav |
| 39 | Full conversation history | ✅ | ❌ | Done — `EmailConversationEntryView` per entry |
| 40 | Attachments list + previews | ✅ | ❌ | Done — `EmailAttachmentsView` (list only; opening is `tap → no-op` for V2, Phase 3 download path is server-side TODO) |
| 41 | HTML render mode toggle | ✅ | ❌ | Done — `EmailHTMLView` wraps WKWebView, toggled by `@AppStorage("focus-forge.email.html-render-mode")` |
| 42 | Resizable detail panel | ❌ | ❌ | N/A on iOS |
| 43 | Reply / Reply-all rich editor | ✅ | ❌ | Done — `EmailReplyComposerView` |
| 44 | Internal note mode | ✅ | ❌ | Done — composer mode toggle |
| 45 | AI reply generation w/ overrides | ✅ | ❌ | Done — `EmailAIReplyOptionsView` (tone, conciseness, personality) |
| 46 | Schedule reply | ✅ | ❌ | Done — DatePicker + ISO8601 with offset |
| 47 | Signature picker | ✅ | ❌ | Done — `EmailSignaturePickerView`; stored in `UserDefaults` mirror of web `focus-forge.email-signatures` key |
| 48 | Reply attachments (upload/inline) | ✅ | ❌ | Done — `EmailAttachmentPickerView` (PhotosPicker + fileImporter); attachments sent as `data:` base64 URLs |
| 49 | New outbound composer | ✅ | ❌ | Done — `EmailComposeView`; FAB lives in `ReplyQueueOverlayModifier` on `RootTabView` |
| 50 | Reply queue (draft/scheduled/failed/sent) | ✅ | ❌ | Done — `EmailReplyQueueView` + `ReplyQueueStore.shared` polling |
| 51 | Project picker / link | ✅ | ❌ | Done — `EmailProjectPickerView` |
| 52 | Inline project creation | ✅ | ❌ | Done — "+ Add New Project" in picker |
| 53 | Linked tasks counter/list | ✅ | ❌ | Done — `EmailInboxRowView` now shows tappable "X Tasks" capsule that opens `EmailLinkedTasksView` sheet (loaded via `fetchThreadDetail`) |
| 54 | Linked tasks modal | ✅ | ❌ | Done |
| 55 | AI summary on-hover toggle | ✅ | ❌ | Done — `@AppStorage("emailWorkAlwaysShowSummary")` (toggle UI removed when Email Work was; preference still respected) |
| 56 | Email excerpt on-hover toggle | ✅ | ❌ | Same as 55 |
| 57 | Spam review modal | ✅ | ❌ | Done — `EmailSpamScanView` |
| 58 | AI spam scan w/ progress bar | ✅ | ❌ | Done — polls `/inbox?classification=spam`; no dedicated `/spam-scan` endpoint on server today |
| 59 | Email rules panel/editor | ✅ | ❌ | Done — `EmailRulesView` + `EmailRuleEditorView`; "Suggest rule" via `/api/email/rules/assistant` |
| 60 | AI profiles (Email AI Lab) | ✅ | ❌ | Done — `EmailAIProfilesView` |
| 61 | Sender history modal | ✅ | ❌ | Done — `EmailSenderHistoryView` |
| 62 | Browser/push notifications | ✅ | — | Done — APNs registration via `PushNotificationCoordinator`; POSTs token to `/api/mobile/push/device` |

---

## Why "Today › Email Work" is now empty in the matrix

The user removed the Today › Email Work accordion in the final UI pass because it was redundant with the Email tab. The underlying view files (`Features/Today/EmailWork/`) are still on disk but unwired. Pending a deletion pass — see open question #1 in the handoff doc.

---

## Backend gaps the next agent should be aware of

1. **`/api/email/mailboxes` POST** accepts IMAP/SMTP credentials only. iOS now sends `{ provider, authMethod: "oauth", oauthAccessToken, oauthRefreshToken }`. Server-side ingestion path is missing — OAuth mailbox-add will fail until the web team adds it.
2. **No dedicated spam-scan progress endpoint**. iOS polls `/inbox?classification=spam` for V3.
3. **`EmailEmptyTrashResultDTO`** is a 1-field stub on iOS (`deletedThreadCount: Int?`). Confirm real shape against `lib/email-inbox/server.ts` next time empty-trash is exercised.
4. **`reprocess` action** returns a full `EmailThreadDetailDTO`, not the generic `EmailThreadActionResultDTO` the other actions return. iOS has a dedicated `reprocessThread(id:)` repo method to handle this.

---

## How to resume in a fresh session

1. Read `focus-forge-ios-app/docs/SESSION-HANDOFF.md` first — has uncommitted work summary, build commands, credentials, and external blockers.
2. `cd focus-forge-ios-app && git status` — there are ~9 modified files of UI polish ready to commit; suggested message is in the handoff doc.
3. Check whether the Apple Developer Program membership is renewed. If yes → run the TestFlight upload commands in the handoff doc.
4. For the **289 vs 30 email count** open question: get a Bearer token from the user (DevTools or 1Password) and run the curl probe in the handoff doc.
