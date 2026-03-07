# Verification and Testing

To ensure the application is functioning correctly, follow these manual verification steps.

## Core Features Test

### 1. Database Persistence
- Create a session, stop the Docker container, and restart it.
- **Expected Result**: The session and its timeline should still be visible.

### 2. Command Execution
- Run `ping 127.0.0.1 -c 4` from the UI.
- **Expected Result**: Live output should appear in the timeline and the status should change to "success".

### 3. Media Uploads
- Upload a sample `.png` file as a screenshot.
- **Expected Result**: The image should render correctly within the timeline and be saved to `data/sessions/<id>/screenshots/`.

### 4. AI Integration
- Enter a dummy API key and attempt an enhancement.
- **Expected Result**: The application should show an authentication error from the provider, confirming communication is established.

### 5. PDF Export
- Click "Export PDF" on any report draft.
- **Expected Result**: A browser download should trigger containing the formatted Markdown.

## Maintenance Test
- Click the "Maintenance" icon and run any cleanup process.
- **Expected Result**: The `app_logs` table should be cleared.
