# Theme System and Styling

The UI of Helm's Paladin is designed to evoke a "hacker-aesthetic" while remaining highly usable for professional reporting.

## Design Philosophy
- **High Contrast**: Essential for focus during intense CTF sessions.
- **Micro-interactions**: Hover effects and smooth transitions provide immediate feedback.
- **Thematic Consistency**: Colors are chosen to match the target environment (e.g., terminal greens and deep blues).

## Implementation
Styles are defined in `app/globals.css` using standard CSS variables (tokens) to manage the design system.

### Color Tokens
- `--background`: Deep black or dark grey.
- `--text`: High-readability white or light grey.
- `--accent`: Cyan, Green, or Blue depending on the context.

### PDF Export Themes
The system supports three distinct themes for PDF generation:
1.  **Terminal Dark**: Mimics a Linux terminal (green on black).
2.  **Professional**: A corporate navy-and-white style.
3.  **Minimal**: A clean, GitHub-style light grey theme.

All styles are applied during the PDF generation phase using the `pdfmake` library's styling engine.
