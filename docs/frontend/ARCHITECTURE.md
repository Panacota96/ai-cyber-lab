# Frontend Architecture

Helm's Paladin is built as a highly interactive Single-Page Application (SPA) within the Next.js App Router framework.

## Core Framework
- **Next.js 16**: Utilizes the App Router for layouts and SEO optimization.
- **React 19**: Leverages the latest React features for state management and DOM manipulation.

## Component Structure
The primary interface resides in `app/page.js`, which serves as a container for several logical sections:

1. **Header + Session controls**: session lifecycle, AI coach, report generation.
2. **Sidebar Toolbox**: command suggestions, flags cheatsheet, command history.
3. **Timeline View**: real-time event feed with filters, focus mode, and jump controls.
4. **Dynamic Report Editor Modal**: block-based walkthrough editor (section/code/screenshot blocks).

## State Management
State is managed using standard React `useState` and `useEffect` hooks, synchronized with the server via the `/api/*` endpoints. 

- **Real-time Updates**: The application uses short-polling to check for updates on long-running commands, ensuring the UI stays synchronized with the backend.
- **Persistence**:
  - Server persistence for sessions/timeline/writeups.
  - Client persistence for UI preferences such as sidebar state and history focus mode.

## UX Behaviors
- **History Focus mode**: maximizes timeline reading space by hiding/compressing surrounding UI.
- **Scroll policy**: timeline auto-follows only when near bottom; manual reading position is preserved.
- **Jump controls**: contextual `To Top` / `To Bottom` buttons appear when appropriate.
