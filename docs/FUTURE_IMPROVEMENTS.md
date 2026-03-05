# Future Improvements

## 1) Executive Summary
This document lists a full improvement backlog for AI Cyber Lab, prioritized for a local-first offensive security workflow with human-in-the-loop controls.

Design goals for this roadmap:
- Keep authorized pentest/CTF operations fast and traceable.
- Make the UI default to analyst-friendly workflows while preserving raw JSON access.
- Improve automation and intelligence without losing scope control.
- Move toward a SysReptor-like reporting and case-management experience.

Top outcomes expected by the end of the 90-day plan:
- Live report generation during active sessions.
- Stronger evidence graph and fact validation flows.
- Better proposal quality (Codex/Claude/Gemini) with fewer unsafe or noisy commands.
- More complete pentest tool orchestration and repeatability.
- Clear QA gates for both code and operational outputs.

## 2) Methodology (Full Scan + Online Inspiration)
### Local scan performed
- Reviewed current architecture, docs, tests, and workflows:
  - Multi-page UI (`recon`, `graph`, `proposals`, `cracking`, `docs`, `sessions`, `reports`).
  - Orchestrator APIs for routing, jobs, findings, evidence, graph, exports, diagnostics.
  - Tool execution service, job worker, graph backend abstraction (`sqlite` + optional `neo4j`).
  - Logging and troubleshooting bundle workflows with 1MB cap requirement.
  - Existing docs: testing roadmap, usage playbook, free tools stack, robustness notes.

### Online inspiration sources used
- SysReptor self-hosted installation/configuration:
  - https://docs.sysreptor.com/setup/installation/
  - https://docs.sysreptor.com/setup/configuration/
- DefectDojo OSS platform and automation posture:
  - https://github.com/DefectDojo/django-DefectDojo
  - https://docs.defectdojo.com/
- OWASP WSTG stable testing and reporting structure:
  - https://owasp.org/www-project-web-security-testing-guide/stable/
- Nuclei template-centric scanning model:
  - https://docs.projectdiscovery.io/opensource/nuclei/overview
- OWASP Amass scope and boundary controls:
  - https://owasp-amass.github.io/docs/configuration/
- LangChain/LangGraph multi-agent and graph orchestration patterns:
  - https://docs.langchain.com/oss/python/langchain/multi-agent
  - https://docs.langchain.com/oss/python/langgraph/use-graph-api
- MCP architecture and trust/security principles:
  - https://modelcontextprotocol.io/specification/2024-11-05/index
  - https://modelcontextprotocol.io/specification/2024-11-05/architecture/index
- Pentest notes inspiration:
  - https://github.com/SofianeHamlaoui/Pentest-Notes
- NIST assessment planning/execution/reporting structure:
  - https://csrc.nist.gov/pubs/sp/800/115/final

## 3) Current-State Snapshot
### Strengths
- Clear segmented agent model (study, pentest, report, knowledge, research).
- Strong local-first infra (Docker + optional Kubernetes + WSL fit).
- Human-in-the-loop review exists for facts.
- Multi-LLM proposals and graph capabilities already started.
- Good test baseline and troubleshooting endpoints.

### Main gaps
- Reporting UX is not yet equivalent to dedicated pentest reporting platforms.
- Real-time report updates are limited.
- Command proposals need stronger quality scoring and policy control.
- Graph relationships need richer semantics and stronger query presets.
- Workflow governance (checklists, gates, playbooks, approvals) is partial.

## 4) Backlog By Category

## 4.1 Functionality
| ID | Improvement | 30d | 60d | 90d | Impact | Effort | Risk | Dependencies | KPI |
|---|---|---|---|---|---|---|---|---|---|
| F01 | Case dashboard with project health, active jobs, pending reviews | Add summary cards and filters | Add cross-project comparison | Add trend widgets | High: faster operator decisions | M | Low | UI + API aggregates | 30% faster triage time |
| F02 | Real-time session timeline (websocket/SSE) | Stream jobs/events | Add finding/evidence events | Add exportable timeline snapshots | High: better incident reconstruction | M | Medium | Event bus + UI | 90% sessions with full timeline |
| F03 | Findings lifecycle states (draft/validated/reported/remediated) | Add state model | Add transitions + audit notes | Add SLA tracking | High: reporting maturity | M | Medium | DB migration | 100% findings stateful |
| F04 | Advanced export formats (JSON, HTML, PDF pack, evidence bundle) | Standardize export manifest | Add signed checksums | Add one-click package profiles | High: client-ready outputs | M | Low | exporter module | 80% fewer manual packaging steps |
| F05 | Reusable case templates per engagement type | Add template CRUD | Add inheritance/versioning | Add team default templates | Medium: consistency | M | Low | UI docs/report modules | 50% faster case setup |
| F06 | API tokens and per-role permissions for UI/API | Add token issuance + scopes | Add project-level RBAC | Add audit dashboard | High: secure collaboration | H | Medium | auth layer | 0 unauthorized sensitive actions |

## 4.2 Automation
| ID | Improvement | 30d | 60d | 90d | Impact | Effort | Risk | Dependencies | KPI |
|---|---|---|---|---|---|---|---|---|---|
| A01 | Playbook automation engine (recon/web/ad/linux/windows chains) | Define YAML playbooks | Add executor + checkpoints | Add conditional branching | High: repeatability | M | Medium | tool-exec + job-worker | 40% less manual command entry |
| A02 | Auto-ingest parsers for more tool outputs | Add nuclei/amass parsers | Add hydra/hashcat/john parsers | Add confidence calibration | High: richer facts | M | Low | parser library | 2x discovered structured facts |
| A03 | Scheduled background tasks | Add scheduler for indexing/cleanup | Add daily QA jobs | Add periodic drift reports | Medium: hygiene and scale | M | Low | worker infra | 95% scheduled tasks success |
| A04 | Auto evidence linking rules | Link by command/finding context | Link by screenshot metadata | Link by graph relation confidence | High: report speed | M | Medium | evidence + graph metadata | 60% evidence auto-linked |
| A05 | Auto report section draft updates | Draft per phase (Recon/Exploit/etc.) | Add quality checks | Add style/profile templates | High: live reporting | H | Medium | report agent | 50% less end-session writing |
| A06 | CI automation for docs + API contracts | Add md and schema checks | Add endpoint contract snapshots | Add changelog policy hard gate | Medium: release quality | M | Low | CI pipeline | 90% reduction doc regressions |

## 4.3 Intelligence
| ID | Improvement | 30d | 60d | 90d | Impact | Effort | Risk | Dependencies | KPI |
|---|---|---|---|---|---|---|---|---|---|
| I01 | Proposal quality scoring (feasibility, safety, novelty, evidence fit) | Add scoring model | Add re-ranking and thresholds | Add feedback loop tuning | High: fewer bad commands | M | Medium | proposals module | 35% lower rejected proposals |
| I02 | Retrieval-aware recommendations from past projects | Add structured retrieval filters | Add challenge similarity search | Add context snippets in UI cards | High: practical reuse | M | Low | RAG + graph | 25% faster next-step decision |
| I03 | Fact confidence calibration model | Add rule-based baseline | Add calibration from review outcomes | Add per-tool confidence curves | High: graph trustworthiness | M | Medium | workbench facts | 20% fewer false positives |
| I04 | Agent memory policies by scope/sensitivity | Define memory classes | Add retention windows | Add secure purge workflows | Medium: governance | M | Low | memory layer | 100% sensitive data policy tagged |
| I05 | Ensemble explanation cards (why this command) | Add rationale merge | Add source evidence references | Add confidence and dissent view | Medium: analyst trust | S | Low | proposals UI | 70% command approvals with rationale view |
| I06 | Local eval suite for pentest reasoning quality | Add benchmark prompts | Add expected-action rubric | Add regression tracking dashboard | High: stable intelligence | M | Medium | eval framework | No >10% quality drift |

## 4.4 UI/UX
| ID | Improvement | 30d | 60d | 90d | Impact | Effort | Risk | Dependencies | KPI |
|---|---|---|---|---|---|---|---|---|---|
| U01 | SysReptor-like report editor experience | Add split editor/preview | Add finding blocks and snippets | Add PDF profile presets | High: report adoption | H | Medium | docs/report UI | 50% less external editor usage |
| U02 | Graph readability modes (Executive/Analyst/Raw) | Add preset filters | Add semantic coloring and legends | Add saved views per project | High: less graph overload | M | Low | graph UI | 40% fewer manual filter changes |
| U03 | Session workspace layout presets | Add per-role layouts | Add panel pinning and saved states | Add team-shared workspaces | Medium: operator ergonomics | M | Low | UI state store | 30% faster context switches |
| U04 | Command execution cockpit | Add queue board + status icons | Add retry/cancel batch actions | Add risk banners and approvals | High: operational clarity | M | Low | jobs APIs | 25% faster command cycle time |
| U05 | Evidence gallery with annotation | Add thumbnail grid + tags | Add inline annotation tools | Add direct finding-link from gallery | Medium: reporting clarity | M | Medium | evidence pipeline | 2x annotated evidence items |
| U06 | Guided onboarding wizard (new project/session) | Add first-run workflow | Add templates and defaults | Add adaptive tips from behavior | Medium: lower learning curve | S | Low | UI + docs | 60% fewer setup mistakes |

## 4.5 Pentest Tools
| ID | Improvement | 30d | 60d | 90d | Impact | Effort | Risk | Dependencies | KPI |
|---|---|---|---|---|---|---|---|---|---|
| T01 | Tool capability catalog and health checks | Add tool registry endpoint | Add version + path + container checks | Add compatibility alerts | High: reliability | M | Low | tool-exec | 95% tool readiness visibility |
| T02 | Nuclei template workflow integration | Add template/profile selector | Add output parser + findings mapping | Add retest mode per finding | High: vuln coverage | M | Medium | nuclei + parsers | 30% more validated findings |
| T03 | Amass-driven asset enrichment | Add passive asset pass | Add scope controls (`rigid_boundaries`) | Add graph node mapping | High: recon depth | M | Medium | amass runtime | 2x domain/subdomain coverage |
| T04 | Wordlist/profile management service | Add per-purpose wordlists | Add scoped profiles by engagement | Add quality metrics by profile | Medium: consistency | S | Low | config storage | 80% runs use standardized profiles |
| T05 | Safe cracking toolkit wrapper | Add approved command presets | Add resource limits and logs | Add credential-handling policy hooks | Medium: controlled operations | M | Medium | tool-exec policy | 0 untracked cracking attempts |
| T06 | Exegol profile orchestration | Add profile selection in UI | Add session-bound mount controls | Add profile recommendations | Medium: runtime flexibility | M | Medium | docker runtime | 50% less runtime setup time |

## 4.6 Pentest Workflow
| ID | Improvement | 30d | 60d | 90d | Impact | Effort | Risk | Dependencies | KPI |
|---|---|---|---|---|---|---|---|---|---|
| W01 | Phase gates aligned to WSTG/PTES/NIST style flow | Define gate checklist | Enforce gate completion in UI | Add waiver + exception logging | High: methodological rigor | M | Low | workflow engine | 100% sessions with gate trace |
| W02 | Rules of Engagement (RoE) enforcement layer | Add scope and banned actions model | Pre-execution policy checks | Add hard-stop + incident alerting | High: legal/safety control | H | Medium | tool-exec policies | 0 out-of-scope commands executed |
| W03 | Hypothesis-driven testing board | Add assumptions + tests table | Link tests to evidence | Add closure criteria per hypothesis | Medium: analyst quality | M | Low | docs/workflow UI | 70% findings linked to hypothesis |
| W04 | Team collaboration workflow | Add assignment and ownership | Add review queues by role | Add handoff package generator | Medium: multi-operator scale | M | Medium | auth + session model | 40% faster analyst handoffs |
| W05 | Retest and remediation verification flow | Add retest task type | Add before/after evidence compare | Add remediation status in reports | High: practical value | M | Low | findings/report models | 80% findings with retest status |
| W06 | Incident-grade timeline integrity | Add immutable event IDs | Add hash-chained event ledger | Add export verification proof | High: forensic confidence | H | Medium | logging/exporter | 100% exported timelines verifiable |

## 4.7 Documentation
| ID | Improvement | 30d | 60d | 90d | Impact | Effort | Risk | Dependencies | KPI |
|---|---|---|---|---|---|---|---|---|---|
| D01 | Living architecture docs with diagrams | Add C4-level diagrams | Add API/worker/tool dataflow docs | Add update policy per release | Medium: maintainability | S | Low | docs ownership | 100% major services diagrammed |
| D02 | Runbooks for failures and recovery | Add top 20 failure playbooks | Add decision trees | Add drill cadence and checklist | High: ops resilience | M | Low | logs/ops endpoints | 50% lower MTTR |
| D03 | Playbook docs per engagement type | Add web/network/cloud templates | Add expected artifacts per step | Add quality rubric | Medium: consistency | M | Low | workflow docs | 80% sessions mapped to playbook |
| D04 | API docs with examples per endpoint | Add OpenAPI examples | Add UI-to-API mapping table | Add auth/permissions notes | Medium: integration speed | S | Low | orchestrator docs | 40% faster external integration |
| D05 | Prompt and policy documentation | Add proposal prompt library | Add policy rationale and examples | Add versioning and changelog | Medium: explainability | S | Low | proposals/policy | 0 undocumented prompt changes |
| D06 | Reporting style guide and QA checklist | Add finding-writing standards | Add severity justification rules | Add final-review checklist | High: report quality | S | Low | report templates | 30% fewer report rewrites |

## 5) Prioritized Impact Matrix (Top 20)
Scoring formula:
- Priority Score = `Impact*2 - Effort - Risk`
- Impact/Effort/Risk scale: 1 (low) to 5 (high)

| Rank | ID | Improvement | Impact | Effort | Risk | Score |
|---|---|---|---:|---:|---:|---:|
| 1 | W01 | Phase gates aligned to methodology | 5 | 3 | 2 | 5 |
| 2 | W02 | RoE enforcement layer | 5 | 4 | 2 | 4 |
| 3 | A05 | Live report draft updates | 5 | 4 | 2 | 4 |
| 4 | I01 | Proposal quality scoring | 5 | 3 | 3 | 4 |
| 5 | U02 | Graph readability modes | 4 | 3 | 1 | 4 |
| 6 | T02 | Nuclei workflow integration | 4 | 3 | 1 | 4 |
| 7 | F03 | Findings lifecycle states | 4 | 3 | 1 | 4 |
| 8 | D02 | Failure/recovery runbooks | 4 | 2 | 1 | 5 |
| 9 | F02 | Real-time session timeline | 4 | 3 | 2 | 3 |
| 10 | I03 | Fact confidence calibration | 4 | 3 | 2 | 3 |
| 11 | T03 | Amass asset enrichment | 4 | 3 | 2 | 3 |
| 12 | U04 | Command execution cockpit | 4 | 3 | 1 | 4 |
| 13 | A02 | Auto-ingest parsers expansion | 4 | 3 | 1 | 4 |
| 14 | W05 | Retest/remediation flow | 4 | 3 | 1 | 4 |
| 15 | F04 | Advanced export package formats | 4 | 3 | 1 | 4 |
| 16 | D06 | Reporting style guide + QA | 4 | 2 | 1 | 5 |
| 17 | I02 | Retrieval-aware recommendations | 4 | 3 | 1 | 4 |
| 18 | U01 | SysReptor-like report editor UX | 5 | 5 | 3 | 2 |
| 19 | T01 | Tool capability catalog/health | 4 | 3 | 1 | 4 |
| 20 | F01 | Case health dashboard | 4 | 3 | 1 | 4 |

## 6) 30-60-90 Roadmap
## Day 0-30 (Foundation and Control)
Primary objective: improve safety, readability, and reliability with minimal architecture churn.
- Deliver W01, W02, U02, A02, D02, D06.
- Add methodology-aligned phase gates and RoE pre-checks in execution paths.
- Improve graph defaults and readability presets.
- Expand parser coverage for most-used tools in current workflows.
- Publish incident/failure runbooks and reporting QA checklist.

Expected impact by day 30:
- Lower operational risk.
- Faster analyst decision cycles.
- Better report consistency.

## Day 31-60 (Operational Acceleration)
Primary objective: automate repetitive analyst/reporting work and strengthen intelligence quality.
- Deliver A05, I01, I03, U04, F03, T02, T03.
- Start live report drafting per phase.
- Add proposal scoring and confidence calibration.
- Add command cockpit and finding lifecycle transitions.
- Integrate Nuclei and Amass deeper into fact extraction and graphing.

Expected impact by day 60:
- Reduced manual note/report burden.
- More trustworthy command recommendations and facts.
- Higher discovery coverage with structured outputs.

## Day 61-90 (Scale and Maturity)
Primary objective: reach a mature case-management and collaboration posture.
- Deliver U01, F02, W05, F04, W04, D01, D04.
- Build SysReptor-like reporting workspace improvements.
- Add real-time session timeline and richer export packs.
- Add team handoff workflow and architecture/API documentation upgrades.

Expected impact by day 90:
- Near real-time reporting during pentests.
- Stronger team-scale operations and evidence traceability.
- Better external integration readiness.

## 7) Dependency and Risk Notes
- Highest coupling items: W02 (RoE policy enforcement), A05 (live reporting), U01 (advanced report editor).
- Data model migrations likely required for F03/W05/W04.
- Proposal quality work (I01/I03) should ship with eval harness updates to prevent silent regression.
- Live updates (F02) should include fallback polling mode for environments where websockets are restricted.

## 8) Acceptance Criteria
This roadmap is considered successfully executed when:
- All 7 categories have delivered at least 4 roadmap items each.
- Every active pentest session can be exported with full evidence lineage.
- At least 80% of final reports are generated from in-platform workflows (not external manual edits).
- Out-of-scope command execution is prevented by policy checks.
- Fact approval and confidence trends are measurable over time.

## 9) Source-backed Design Principles
- Use structured, template-based reporting and modular customization (SysReptor).
- Use centralized finding management and triage lifecycle patterns (DefectDojo).
- Keep methodology-aligned testing structure and reporting sections (OWASP WSTG, NIST SP 800-115).
- Use template-centric scanner integrations for broad, repeatable checks (Nuclei).
- Enforce scope boundaries and explicit active/passive controls for recon (OWASP Amass).
- Keep multi-agent workflows explicit, measurable, and pattern-driven (LangChain/LangGraph docs).
- Keep client/host/server security boundaries and explicit user consent for powerful tool operations (MCP specification).
