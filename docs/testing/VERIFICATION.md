# Verification and Testing

Use this checklist as the manual release gate for Helm's Watch. A release is only ready when every applicable gate passes.

Recommended local startup paths before running the manual gates:
- `npm run dev:webpack` for browser/manual verification on Windows when Turbopack is unstable with native modules.
- `npm run build` followed by `npm run start:local-runtime` for production-like verification using the same standalone layout the Docker image expects.

## Gate 1: Bootstrap and Persistence

### 1. Session creation and restart
- Create a new session from the UI.
- Restart the app container or local dev server.
- **Expected result:** The session, timeline, findings, flags, credentials, and writeup content are still present after restart.

### 2. Database stats and cleanup safety
- Open the workspace and perform at least one command, one note, one screenshot upload, and one credential save.
- **Expected result:** No runtime errors appear, session data remains queryable, and cleanup tasks do not remove active-session data.

## Gate 2: Live Execution Streaming

### 1. SSE live output
- Run a command that emits incremental output such as `ping 127.0.0.1 -c 4` or an equivalent Windows-friendly command.
- **Expected result:** Output appears progressively in the timeline while the command is still running, progress/state updates change in place, and the final status becomes `success` or `failed` without waiting for the old 3-second polling loop.

### 2. Queue and completion behavior
- Start more commands than `MAX_CONCURRENT_COMMANDS` allows.
- **Expected result:** Extra commands enter `queued`, queued/running transitions appear in the UI, and completion events finalize the correct timeline entry.

### 3. Fallback polling
- Temporarily interrupt the SSE stream, then run another command.
- **Expected result:** Timeline refresh falls back to polling, command state still converges correctly, and reconnecting the page restores live streaming.

## Gate 3: Credential Manager

### 1. Credential CRUD
- Create credentials with a username/password pair, a hash-only record, and notes.
- Edit one record and delete one record.
- **Expected result:** The sidebar updates immediately, persisted credentials survive refresh, and deleted credentials do not return.

### 2. Reporting and export linkage
- Generate a `technical-walkthrough`, `pentest`, and JSON export for a session that has credentials.
- **Expected result:** Markdown-based reports include the credentials section, and JSON export includes a `credentials` array with the saved records.

### 3. Session isolation
- Create credentials in two different sessions.
- **Expected result:** Each session only shows its own credentials.

### 4. Hash identification and command generation
- Create a credential with a supported hash and no `hashType`, then run `Identify Hash`.
- **Expected result:** The sidebar shows the best-match hash family, stores the guessed `hashType` on the credential, and exposes ready-to-insert `john` / `hashcat` commands when those tools are available.

## Gate 4: Graph and Evidence Enrichment

### 1. Graph refresh after command completion
- Run a discovery command that should create hosts, services, usernames, or hashes.
- **Expected result:** The graph refreshes after command completion and shows the newly derived entities without manual repair work.

### 2. Screenshot and evidence continuity
- Upload a screenshot, edit its metadata, and reference it from a finding or PoC workflow.
- **Expected result:** The screenshot renders in the timeline, remains accessible after refresh, and is available to report/export flows.

## Gate 5: Reporting and Export

### 1. Multi-format exports
- Export the same session as Markdown, PDF, HTML, JSON, and DOCX.
- **Expected result:** Each export completes successfully and includes aligned session metadata, findings, PoC content, and credentials where supported.

### 2. Findings and PoC sections
- Create findings with severities and at least one PoC step.
- **Expected result:** Severity summaries render, findings appear in supported report formats, and PoC sections remain ordered correctly.

## Gate 6: Security Controls

### 1. API token and CSRF enforcement
- Attempt an authenticated mutating request without the CSRF token pair.
- Attempt the same request with both `x-api-token` and the CSRF token/cookie pair.
- **Expected result:** The first request is rejected with an auth/security error; the second succeeds.

### 2. Logging mode
- Start the app with `LOG_FORMAT=json` and trigger normal app activity plus one handled error.
- **Expected result:** Console/file logs are valid JSON objects with level and message metadata.

## Gate 7: AI and External Provider Wiring

### 1. Provider connectivity
- Configure a dummy or invalid provider key and trigger AI Coach or report enhancement.
- **Expected result:** The UI surfaces the provider error cleanly, confirming outbound communication and error handling.

### 2. Usage accounting
- Make at least one successful AI request.
- **Expected result:** Session AI usage totals update without breaking the rest of the workspace.

## Gate 8: Shell Hub and Artifacts

### 1. Reverse-shell lifecycle
- Create a reverse shell session, connect a client, send input from the UI, then disconnect it.
- **Expected result:** The shell tab transitions through `listening -> connected -> closed`, transcript chunks persist, and reconnecting the page preserves transcript history.

### 2. Webshell command round-trip
- Create a webshell session with a known-good command endpoint and run at least two commands.
- **Expected result:** Request/response turns appear in the shell transcript, session status updates to `active`, and failures surface as transcript/error entries instead of silent drops.

### 3. Artifact upload and transcript save
- Upload a local text file and an image, then save a transcript chunk or selection as an artifact.
- **Expected result:** Artifacts appear in the sidebar list, text/image previews render inline, download/open links work, and transcript-saved artifacts retain the expected content.

### 4. Report insertion linkage
- Insert at least one uploaded artifact and one transcript artifact into the report editor.
- **Expected result:** The report editor receives the expected Markdown/image reference blocks without losing existing draft content.
