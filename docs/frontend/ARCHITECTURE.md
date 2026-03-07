# Frontend Architecture

Helm's Paladin is built as a highly interactive Single-Page Application (SPA) within the Next.js App Router framework.

## Core Framework
- **Next.js 16**: Utilizes the App Router for layouts and SEO optimization.
- **React 19**: Leverages the latest React features for state management and DOM manipulation.

## Component Structure
The primary interface resides in `app/page.js`, which serves as a container for several logical sections:

1.  **Sidebar**: Session navigation and target metadata editing.
2.  **Toolbox**: A searchable cheatsheet of common reconnaissance commands.
3.  **Timeline View**: A real-time feed of events, dynamically rendered from the SQLite database.
4.  **Report Editor**: A Markdown-capable edit area with integrated AI enhancement triggers.

## State Management
State is managed using standard React `useState` and `useEffect` hooks, synchronized with the server via the `/api/*` endpoints. 

- **Real-time Updates**: The application uses short-polling to check for updates on long-running commands, ensuring the UI stays synchronized with the backend.
- **Persistence**: Temporary UI states (like active filters) are stored in React state, while all critical data is persisted on the server.
