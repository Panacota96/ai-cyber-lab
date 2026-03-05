# Free Tools Stack (Docs, Notes, Learning)

This catalog focuses on free/open-source tools you can run locally or self-host, and how to connect them to AI Cyber Lab workflows.

## Reporting and Deliverables

### SysReptor
- Link: https://github.com/syslifters/sysreptor
- Use for: structured pentest reporting, findings templates, reusable report sections.
- Integration pattern:
  - Keep AI Cyber Lab report agent generating `auto_report.md`.
  - Import findings/evidence summaries into SysReptor templates for final client-style output.

### Pentest-Notes
- Link: https://github.com/SofianeHamlaoui/Pentest-Notes
- Use for: curated pentest knowledge base and methodology baseline.
- Integration pattern:
  - Clone under your knowledge source folder.
  - Run knowledge agent indexing (`index: <folder>`) to make this content searchable via RAG.

### Ghostwriter (optional alternative)
- Link: https://github.com/GhostManager/Ghostwriter
- Use for: collaborative pentest reporting with evidence/finding workflows.
- Integration pattern:
  - Use for final report authoring while AI Cyber Lab handles note capture and preprocessing.

## Notes and Knowledge Management

### Obsidian (free personal use, local-first)
- Link: https://obsidian.md/
- Use for: personal PKM vault with markdown-first workflow.
- Integration pattern:
  - Point project outputs to your vault path.
  - Use generated study/pentest/report markdown files as canonical notes.

### BookStack
- Link: https://github.com/BookStackApp/BookStack
- Use for: team wiki or long-term methodology knowledge base.
- Integration pattern:
  - Periodically sync validated notes from `data/projects` into curated BookStack pages.

### HedgeDoc
- Link: https://github.com/hedgedoc/hedgedoc
- Use for: real-time collaborative markdown during team exercises.
- Integration pattern:
  - Draft notes collaboratively in HedgeDoc, then export and ingest via knowledge indexing.

### Logseq
- Link: https://github.com/logseq/logseq
- Use for: graph-style study notes and concept linking.
- Integration pattern:
  - Use for certification concept maps, then export selected markdown into AI Cyber Lab knowledge sources.

### TriliumNext
- Link: https://github.com/TriliumNext/Trilium
- Use for: structured hierarchical notes with strong organization controls.
- Integration pattern:
  - Keep Trilium as master notes and periodically export markdown snapshots for AI indexing.

## Certification Learning and Retention

### Anki
- Link: https://apps.ankiweb.net/
- Use for: spaced repetition flashcards (CCNA, CPTS, PortSwigger, CTF concepts).
- Integration pattern:
  - Convert study agent flashcards into Anki decks.
  - Tag cards by `ccna`, `htb`, `portswigger`, `ctf`.

### FSRS for Anki
- Link: https://github.com/open-spaced-repetition/fsrs4anki
- Use for: improved scheduling model for long-term retention.
- Integration pattern:
  - Apply FSRS scheduling to decks generated from your study sessions.

### Moodle
- Link: https://github.com/moodle/moodle
- Use for: self-hosted learning management (quizzes, modules, progress tracking).
- Integration pattern:
  - Use AI-generated notes to build quiz banks and weekly certification drills.

## Runtime and Tooling Environments

### Exegol
- Link: https://github.com/ThePorgs/Exegol
- Use for: Docker-based offensive environment with prebuilt toolsets.
- Integration pattern:
  - Run with compose profile (`make up-exegol`).
  - Set `AICL_TOOL_EXEC_MODE=exegol` to route default tool execution into Exegol.

## Recommended Adoption Order
1. SysReptor + Obsidian (or BookStack) for immediate reporting/notes improvements.
2. Anki (+ FSRS) for certification retention loop.
3. HedgeDoc/Logseq/Trilium for collaboration or advanced knowledge organization.
4. Exegol profile when you want richer prebuilt offensive runtime capabilities.
