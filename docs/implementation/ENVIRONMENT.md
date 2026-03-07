# Environment and Local Setup

While Docker is the recommended way to run the application, it can also be configured for local development.

## Requirements
- **Node.js**: 18.x or 20.x
- **SQLite3**: Pre-installed on most systems.

## Environment Variables
The application reads configuration from environment variables (optional):

- `ANTHROPIC_API_KEY`: Pre-fills the Claude API key.
- `GEMINI_API_KEY`: Pre-fills the Google Gemini API key.
- `OPENAI_API_KEY`: Pre-fills the OpenAI API key.

## Local Installation
1.  Clone the repository.
2.  Install dependencies: `npm install`.
3.  Start the development server: `npm run dev`.

## Data Management
The system automatically creates a `data/` directory on first run. 
- Ensure the user running the Node process has write permissions to the project root.
- The SQLite database and session screenshots are all contained within this folder.
