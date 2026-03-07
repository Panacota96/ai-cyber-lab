# AI Models and Prompting

Helm's Paladin is designed to be provider-agnostic, supporting major Large Language Models (LLMs) to power its intelligence features.

## Supported Providers

- **Anthropic (Claude)**: Optimized for long-context analysis and highly structured technical writing.
- **Google (Gemini)**: Leveraged for its efficient processing of large timelines and multimodal capabilities (future support).
- **OpenAI (GPT-4o)**: Used for versatile reasoning and standard technical report generation.

## Implementation Details

### Configuration
API keys are managed client-side in the browser's `localStorage`, ensuring that sensitive credentials never leave the user's environment except during direct API requests to the providers.

### Prompting Strategy
Each "Skill" uses a specialized system prompt combined with:
1.  **Session Context**: Target metadata (IP, OS, Objective).
2.  **Timeline Data**: Serialized events from the SQLite database.
3.  **Specific Directives**: Instructions on the desired output format (Markdown).

### Rate Limiting and Tokens
The application automatically handles large timelines by summarizing older events while maintaining high fidelity for recent, more relevant actions.
