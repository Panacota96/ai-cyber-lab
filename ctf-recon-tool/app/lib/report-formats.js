// Four report format generators for Helm's Watch

/**
 * Build a markdown Table of Contents from ## and ### headings in a string.
 */
function buildToc(md) {
  const entries = md.split('\n')
    .filter(l => /^#{2,3} /.test(l))
    .map(l => {
      const depth = l.match(/^(#{2,3})/)[1].length;
      const title = l.replace(/^#{2,3} /, '');
      const anchor = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      return `${'  '.repeat(depth - 2)}- [${title}](#${anchor})`;
    });
  return entries.length ? `## Table of Contents\n\n${entries.join('\n')}\n\n` : '';
}

function clipText(text, max = 900) {
  const value = String(text || '');
  if (value.length <= max) return value;
  return `${value.slice(0, max)}... [truncated]`;
}

function normalizePocStep(step) {
  if (!step || typeof step !== 'object') return null;
  return {
    stepOrder: step.stepOrder ?? step.step_order ?? null,
    title: step.title || '',
    goal: step.goal || '',
    observation: step.observation || '',
    executionEventId: step.executionEventId ?? step.execution_event_id ?? null,
    noteEventId: step.noteEventId ?? step.note_event_id ?? null,
    screenshotEventId: step.screenshotEventId ?? step.screenshot_event_id ?? null,
    executionEvent: step.executionEvent || step.execution_event || null,
    noteEvent: step.noteEvent || step.note_event || null,
    screenshotEvent: step.screenshotEvent || step.screenshot_event || null,
  };
}

function renderPocSection(session, pocSteps) {
  const normalized = (Array.isArray(pocSteps) ? pocSteps : [])
    .map(normalizePocStep)
    .filter(Boolean)
    .sort((a, b) => Number(a.stepOrder || 0) - Number(b.stepOrder || 0));

  let md = `## Proof of Concept\n\n`;
  if (normalized.length === 0) {
    md += `_No PoC steps recorded for this session._\n\n`;
    return md;
  }

  normalized.forEach((step, idx) => {
    const title = step.title || `Step ${idx + 1}`;
    const execution = step.executionEvent;
    const note = step.noteEvent;
    const screenshot = step.screenshotEvent;

    md += `### ${idx + 1}. ${title}\n\n`;
    md += `**Goal:** ${step.goal || '_Not specified_'}\n\n`;

    if (execution) {
      md += `**Execution:** \`${execution.command || '(command unavailable)'}\`\n\n`;
      if (execution.output) {
        md += `\`\`\`text\n${clipText(execution.output, 1000)}\n\`\`\`\n\n`;
      }
    } else if (step.executionEventId) {
      md += `**Execution:** _Linked command not found (${step.executionEventId})_\n\n`;
    } else {
      md += `**Execution:** _Not linked_\n\n`;
    }

    if (screenshot) {
      md += `**Evidence:** ${screenshot.name || 'Screenshot'}\n\n`;
      md += `![${screenshot.name || 'Screenshot'}](/api/media/${session.id}/${screenshot.filename})\n\n`;
    } else if (step.screenshotEventId) {
      md += `**Evidence:** _Linked screenshot not found (${step.screenshotEventId})_\n\n`;
    } else {
      md += `**Evidence:** _Not linked_\n\n`;
    }

    const observation = step.observation || note?.content || '';
    md += `**Observation:** ${observation || '_Not specified_'}\n\n`;
  });

  return md;
}

export function labReport(session, events, analystName = 'Unknown') {
  const timestamp = new Date().toLocaleString();
  let md = `# Laboratory Report: ${session.name}\n\n`;
  md += `**Date of Execution:** ${timestamp}\n`;
  md += `**Analyst:** ${analystName}\n`;
  if (session.target) md += `**Target:** ${session.target}\n`;
  if (session.difficulty) md += `**Difficulty:** ${session.difficulty.toUpperCase()}\n`;
  if (session.objective) md += `**Objective:** ${session.objective}\n`;
  md += `\n`;

  let body = '';
  body += `## 1. Overview\n`;
  body += `This document serves as the official laboratory report for the reconnaissance session conducted on **${session.name}**. It contains a detailed log of commands executed, observations recorded, and technical evidence captured during the engagement.\n\n`;

  const notes = events.filter(e => e.type === 'note');
  body += `## 2. Reconnaissance Observations\n`;
  if (notes.length > 0) {
    notes.forEach(note => {
      body += `*   **Observation:** ${note.content} [Timestamp: ${new Date(note.timestamp).toLocaleTimeString()}]\n`;
    });
  } else {
    body += `No manual observations were recorded during this session.\n`;
  }
  body += `\n`;

  const commands = events.filter(e => e.type === 'command');
  body += `## 3. Operation Timeline\n`;
  if (commands.length > 0) {
    commands.forEach((cmd, i) => {
      body += `### 3.${i + 1}. Execution: \`${cmd.command}\`\n`;
      body += `*   **Status:** ${cmd.status.toUpperCase()}\n`;
      if (cmd.output) {
        const clean = cmd.output.length > 1200 ? cmd.output.substring(0, 1200) + '... [truncated]' : cmd.output;
        body += `\n**Console Output:**\n\`\`\`text\n${clean}\n\`\`\`\n`;
      }
      body += `\n`;
    });
  } else {
    body += `No command executions were logged.\n`;
  }

  const screenshots = events.filter(e => e.type === 'screenshot');
  body += `## 4. Technical Evidence\n`;
  if (screenshots.length > 0) {
    screenshots.forEach((ss, i) => {
      body += `### 4.${i + 1}. ${ss.name || 'Screenshot'}\n`;
      body += `![${ss.name}](/api/media/${session.id}/${ss.filename})\n`;
      if (ss.tag) body += `*   **Tag:** #${ss.tag}\n`;
      body += `\n`;
    });
  } else {
    body += `No visual evidence was captured during the session.\n`;
  }

  body += `## 5. Conclusion\n`;
  body += `The reconnaissance session for **${session.name}** has been concluded. All recorded activities and data points presented in this report constitute the final findings of the laboratory exercise.\n\n`;
  body += `---\n*Report generated by Helm's Watch*`;
  return md + buildToc(body) + body;
}

export function executiveSummary(session, events, analystName = 'Unknown') {
  const timestamp = new Date().toLocaleString();
  let md = `# Executive Summary: ${session.name}\n\n`;
  md += `**Date:** ${timestamp} | **Analyst:** ${analystName}`;
  if (session.target) md += ` | **Target:** ${session.target}`;
  if (session.difficulty) md += ` | **Difficulty:** ${session.difficulty.toUpperCase()}`;
  md += `\n\n`;

  if (session.objective) {
    md += `## Objective\n${session.objective}\n\n`;
  }

  const notes = events.filter(e => e.type === 'note');
  const commands = events.filter(e => e.type === 'command');
  const successful = commands.filter(c => c.status === 'success' || c.status === 'completed');
  const failed = commands.filter(c => c.status === 'failed' || c.status === 'error');
  const screenshots = events.filter(e => e.type === 'screenshot');

  md += `## Activity Summary\n`;
  md += `| Metric | Count |\n|--------|-------|\n`;
  md += `| Commands Executed | ${commands.length} |\n`;
  md += `| Successful | ${successful.length} |\n`;
  md += `| Failed | ${failed.length} |\n`;
  md += `| Notes Recorded | ${notes.length} |\n`;
  md += `| Screenshots Captured | ${screenshots.length} |\n\n`;

  if (notes.length > 0) {
    md += `## Key Findings\n`;
    notes.forEach(note => {
      md += `- ${note.content}\n`;
    });
    md += `\n`;
  }

  if (successful.length > 0) {
    md += `## Successful Operations\n`;
    successful.forEach(cmd => {
      md += `- \`${cmd.command}\`\n`;
    });
    md += `\n`;
  }

  if (screenshots.length > 0) {
    md += `## Evidence Captured\n`;
    screenshots.forEach(ss => {
      md += `- **${ss.name}**${ss.tag ? ` (#${ss.tag})` : ''}\n`;
    });
    md += `\n`;
  }

  md += `---\n*Executive Summary generated by Helm's Watch*`;
  return md;
}

export function technicalWalkthrough(session, events, analystName = 'Unknown', options = {}) {
  const timestamp = new Date().toLocaleString();
  const pocSteps = Array.isArray(options?.pocSteps) ? options.pocSteps : [];
  let md = `# Technical Walkthrough: ${session.name}\n\n`;
  md += `**Date:** ${timestamp} | **Analyst:** ${analystName}`;
  if (session.target) md += ` | **Target:** ${session.target}`;
  md += `\n\n`;

  if (session.objective) {
    md += `> **Objective:** ${session.objective}\n\n`;
  }

  md += `## Walkthrough\n\n`;

  const allEvents = [...events].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  let step = 1;

  for (const event of allEvents) {
    const time = new Date(event.timestamp).toLocaleTimeString();

    if (event.type === 'command') {
      md += `### Step ${step}: \`${event.command}\`\n`;
      md += `*[${time}] — Status: ${event.status.toUpperCase()}*\n\n`;
      if (event.output) {
        const clean = event.output.length > 800 ? event.output.substring(0, 800) + '... [truncated]' : event.output;
        md += `**Output:**\n\`\`\`\n${clean}\n\`\`\`\n\n`;
      }
      step++;
    } else if (event.type === 'note') {
      md += `> **Note** *(${time}):* ${event.content}\n\n`;
    } else if (event.type === 'screenshot') {
      md += `**Evidence** *(${time}):* ${event.name}${event.tag ? ` — #${event.tag}` : ''}\n`;
      md += `![${event.name}](/api/media/${session.id}/${event.filename})\n\n`;
    }
  }

  md += `${renderPocSection(session, pocSteps)}`;

  md += `---\n*Technical Walkthrough generated by Helm's Watch*`;
  return md;
}

export function ctfSolution(session, events, analystName = 'Unknown') {
  const timestamp = new Date().toLocaleString();
  let md = `# CTF Solution: ${session.name}\n\n`;
  if (session.target) md += `**Target:** \`${session.target}\`  \n`;
  if (session.difficulty) md += `**Difficulty:** ${session.difficulty}  \n`;
  md += `**Date:** ${timestamp}  \n**Analyst:** ${analystName}\n\n`;

  if (session.objective) {
    md += `## Challenge Description\n${session.objective}\n\n`;
  }

  const commands = events.filter(e => e.type === 'command' && (e.status === 'success' || e.status === 'completed'));
  const notes = events.filter(e => e.type === 'note');
  const screenshots = events.filter(e => e.type === 'screenshot');

  if (notes.length > 0) {
    md += `## Approach\n`;
    notes.forEach(n => md += `- ${n.content}\n`);
    md += `\n`;
  }

  md += `## Solution Steps\n\n`;
  commands.forEach((cmd, i) => {
    md += `**${i + 1}.** \`${cmd.command}\`\n`;
    if (cmd.output) {
      const lines = cmd.output.trim().split('\n').slice(0, 10);
      md += `\`\`\`\n${lines.join('\n')}${cmd.output.split('\n').length > 10 ? '\n...' : ''}\n\`\`\`\n`;
    }
    md += `\n`;
  });

  if (screenshots.length > 0) {
    md += `## Screenshots\n\n`;
    screenshots.forEach(ss => {
      md += `![${ss.name}](/api/media/${session.id}/${ss.filename})\n`;
      if (ss.tag) md += `*${ss.tag}*\n`;
      md += `\n`;
    });
  }

  md += `---\n*CTF Solution generated by Helm's Watch*`;
  return md;
}

export function bugBountyReport(session, events, analystName = 'Unknown') {
  const timestamp = new Date().toLocaleString();
  const commands = events.filter(e => e.type === 'command' && e.status === 'success');
  const notes = events.filter(e => e.type === 'note');
  const screenshots = events.filter(e => e.type === 'screenshot');

  let md = `# Bug Bounty Report\n\n`;
  md += `| Field | Value |\n| --- | --- |\n`;
  md += `| **Target** | ${session.target || '_unknown_'} |\n`;
  md += `| **Analyst** | ${analystName} |\n`;
  md += `| **Severity** | _High / Medium / Low / Info — fill in_ |\n`;
  md += `| **CVSS Score** | _e.g. 7.5 (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N)_ |\n`;
  md += `| **CWE** | _e.g. CWE-79, CWE-89 — fill in_ |\n`;
  md += `| **Date** | ${timestamp} |\n`;
  if (session.objective) md += `| **Summary** | ${session.objective} |\n`;
  md += `\n`;

  md += `## Summary\n\n`;
  md += `_Describe the vulnerability in 2-3 sentences: what it is, where it exists, and what an attacker could do._\n\n`;
  if (notes.length > 0) {
    notes.forEach(n => { md += `> ${n.content}\n`; });
    md += `\n`;
  }

  md += `## Steps to Reproduce\n\n`;
  if (commands.length > 0) {
    commands.forEach((cmd, i) => {
      md += `**${i + 1}.** \`${cmd.command}\`\n`;
      if (cmd.output) {
        const preview = cmd.output.length > 600 ? cmd.output.substring(0, 600) + '... [truncated]' : cmd.output;
        md += `\`\`\`\n${preview}\n\`\`\`\n`;
      }
      md += `\n`;
    });
  } else {
    md += `_No successful commands recorded. Add steps manually._\n\n`;
  }

  md += `## Impact\n\n`;
  md += `_Describe the business or security impact. What data or functionality could an attacker access or modify?_\n\n`;

  if (screenshots.length > 0) {
    md += `## Evidence\n\n`;
    screenshots.forEach((ss, i) => {
      md += `### Evidence ${i + 1}: ${ss.name || 'Screenshot'}\n`;
      md += `![${ss.name}](/api/media/${session.id}/${ss.filename})\n`;
      if (ss.tag) md += `*${ss.tag}*\n`;
      md += `\n`;
    });
  }

  md += `## Suggested Fix\n\n`;
  md += `_Provide concrete remediation guidance: patch, configuration change, or code fix._\n\n`;
  md += `---\n*Bug Bounty Report generated by Helm's Watch*`;
  return md;
}

export function pentestReport(session, events, analystName = 'Unknown', options = {}) {
  const timestamp = new Date().toLocaleString();
  const pocSteps = Array.isArray(options?.pocSteps) ? options.pocSteps : [];
  const allCmds = events.filter(e => e.type === 'command');
  const successCmds = allCmds.filter(c => c.status === 'success');
  const failedCmds = allCmds.filter(c => c.status === 'failed');
  const notes = events.filter(e => e.type === 'note');
  const screenshots = events.filter(e => e.type === 'screenshot');

  let md = `# Penetration Test Report\n\n`;
  md += `**Engagement:** ${session.name}  \n`;
  if (session.target) md += `**Target:** ${session.target}  \n`;
  if (session.difficulty) md += `**Classification:** ${session.difficulty.toUpperCase()}  \n`;
  md += `**Report Date:** ${timestamp}  \n`;
  md += `**Prepared by:** ${analystName}  \n\n`;

  md += `---\n\n## Executive Summary\n\n`;
  if (session.objective) {
    md += `**Objective:** ${session.objective}\n\n`;
  }
  md += `| Metric | Value |\n| --- | --- |\n`;
  md += `| Commands Executed | ${allCmds.length} |\n`;
  md += `| Successful | ${successCmds.length} |\n`;
  md += `| Failed | ${failedCmds.length} |\n`;
  md += `| Notes Recorded | ${notes.length} |\n`;
  md += `| Screenshots | ${screenshots.length} |\n\n`;
  md += `_Overall risk posture: — fill in (Critical / High / Medium / Low)_\n\n`;

  md += `## Methodology\n\n`;
  md += `Testing followed a structured approach:\n\n`;
  md += `1. **Pre-Engagement** — Scope definition and target identification\n`;
  md += `2. **Information Gathering** — Passive and active reconnaissance\n`;
  md += `3. **Vulnerability Assessment** — Service enumeration and weakness identification\n`;
  md += `4. **Exploitation** — Controlled exploitation of confirmed vulnerabilities\n`;
  md += `5. **Post-Exploitation** — Privilege escalation and lateral movement assessment\n`;
  md += `6. **Reporting** — Documentation of findings with evidence\n\n`;

  md += `## Attack Path\n\n`;
  const sortedCmds = [...successCmds].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  if (sortedCmds.length > 0) {
    sortedCmds.forEach((cmd, i) => {
      const time = new Date(cmd.timestamp).toLocaleTimeString();
      md += `### Step ${i + 1}: \`${cmd.command}\`\n`;
      md += `*[${time}]*\n\n`;
      if (cmd.output) {
        const clean = cmd.output.length > 800 ? cmd.output.substring(0, 800) + '... [truncated]' : cmd.output;
        md += `**Output:**\n\`\`\`\n${clean}\n\`\`\`\n\n`;
      }
    });
  } else {
    md += `_No successful commands recorded._\n\n`;
  }

  md += `${renderPocSection(session, pocSteps)}`;

  md += `## Findings\n\n`;
  md += `> _Document each finding with severity, description, and evidence references._\n\n`;
  md += `| # | Finding | Severity | Evidence |\n| --- | --- | --- | --- |\n`;
  md += `| 1 | _Fill in_ | Critical / High / Medium / Low | _ref_ |\n\n`;

  if (notes.length > 0) {
    md += `## Analyst Notes\n\n`;
    notes.forEach(n => { md += `- ${n.content}\n`; });
    md += `\n`;
  }

  if (screenshots.length > 0) {
    md += `## Evidence\n\n`;
    screenshots.forEach((ss, i) => {
      md += `### ${i + 1}. ${ss.name || 'Screenshot'}\n`;
      md += `![${ss.name}](/api/media/${session.id}/${ss.filename})\n`;
      if (ss.tag) md += `*${ss.tag}*\n`;
      md += `\n`;
    });
  }

  md += `## Remediation Roadmap\n\n`;
  md += `| Priority | Finding | Recommended Fix | Owner |\n| --- | --- | --- | --- |\n`;
  md += `| 1 | _Fill in_ | _Fill in_ | _Fill in_ |\n\n`;

  md += `## Appendix — Raw Command Log\n\n`;
  allCmds.forEach(cmd => {
    md += `- \`${cmd.command}\` → **${cmd.status}**\n`;
  });

  md += `\n---\n*Pentest Report generated by Helm's Watch*`;

  // Insert auto-generated TOC after the title block (before first ##)
  const tocInsertPos = md.indexOf('\n## ');
  if (tocInsertPos !== -1) {
    const body = md.slice(tocInsertPos + 1);
    md = md.slice(0, tocInsertPos + 1) + buildToc(body) + body;
  }
  return md;
}
