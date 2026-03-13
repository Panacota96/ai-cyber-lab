import {
  newCodeBlock,
  newImageBlock,
  newSectionBlock,
  parseWriteupBlocks,
} from '@/domains/reporting/lib/report-blocks';

function cloneBlocks(blocks = []) {
  return parseWriteupBlocks(blocks);
}

const BUILT_IN_PACKS = [
  {
    packId: 'htb-machine',
    name: 'HTB Machine',
    description: 'Machine-style walkthrough with enumeration, foothold, privilege escalation, and flags.',
    format: 'technical-walkthrough',
    blocks: [
      newSectionBlock('Executive Summary', 'Target: **{{sessionTarget}}**\n\nBriefly summarize the compromise path, critical weaknesses, and final impact.'),
      newSectionBlock('Summary of Major Findings', '- Initial access vector\n- Key credentials / secrets\n- Privilege-escalation path\n- Flags captured'),
      newSectionBlock('Information Gathering', 'Document the initial recon, service triage, and high-signal observations.'),
      newCodeBlock('Enumeration Commands', 'nmap -sC -sV -oA scans/{{sessionName}} {{sessionTarget}}', 'bash'),
      newImageBlock('Enumeration Evidence', '', 'Enumeration screenshot', 'Attach the most useful enumeration screenshot.', '', { layout: 'full' }),
      newSectionBlock('Foothold', 'Describe the entry point, payload, and operator reasoning.'),
      newSectionBlock('Privilege Escalation', 'Capture the exact escalation path, artifacts, and proof.'),
      newSectionBlock('Flag / Password', '```text\nuser.txt = \nroot.txt = \n```'),
      newSectionBlock('Reusable Improvements', '- Scripts worth saving\n- Detection opportunities\n- Hardening priorities'),
    ],
  },
  {
    packId: 'thm-room',
    name: 'THM Room',
    description: 'Room-oriented writeup with tasks, validation points, and walkthrough evidence.',
    format: 'ctf-solution',
    blocks: [
      newSectionBlock('Room Summary', 'Room: **{{sessionName}}**\n\nGoal, scope, and final completion state.'),
      newSectionBlock('Task Map', '- Task 1\n- Task 2\n- Task 3'),
      newSectionBlock('Enumeration', 'List the services, files, and paths that informed the solution.'),
      newSectionBlock('Exploitation', 'Walk through the exploitation chain with commands and observations.'),
      newImageBlock('Task Evidence', '', 'Task proof screenshot', 'Attach proof that validates the room milestone.', '', { layout: 'split-right' }),
      newSectionBlock('Flags and Answers', '```text\nFlag 1 = \nFlag 2 = \n```'),
      newSectionBlock('Takeaways', '- What was learned\n- What slowed the solve\n- What to automate next'),
    ],
  },
  {
    packId: 'web-challenge',
    name: 'Web Challenge',
    description: 'Challenge template focused on recon, vulnerability discovery, exploitation, and final artifact capture.',
    format: 'ctf-solution',
    blocks: [
      newSectionBlock('Challenge Overview', 'Challenge target, category, and final objective.'),
      newSectionBlock('Recon and Mapping', 'Note endpoints, parameters, auth flows, and trust boundaries.'),
      newCodeBlock('Useful Requests', 'curl -i http://target/\nffuf -u http://target/FUZZ -w /usr/share/wordlists/dirb/common.txt', 'bash'),
      newSectionBlock('Vulnerability Analysis', 'Document the bug class, root cause, and exploit constraints.'),
      newImageBlock('Proof Screenshot', '', 'Exploit proof screenshot', 'Attach the request/response or browser proof.', '', { layout: 'split-left' }),
      newSectionBlock('Exploit Path', 'Describe the minimal reproducible steps to win the challenge.'),
      newSectionBlock('Flag', '```text\nflag{}\n```'),
      newSectionBlock('Reusable Improvements', '- Payloads worth saving\n- Detection ideas\n- Defensive fix'),
    ],
  },
  {
    packId: 'oscp-host',
    name: 'OSCP Host',
    description: 'Host-style template emphasizing reproducibility, enumeration depth, foothold, and privilege escalation.',
    format: 'pentest',
    blocks: [
      newSectionBlock('Host Summary', 'Host: **{{sessionTarget}}**\n\nSummarize the compromise path and business impact.'),
      newSectionBlock('Scope and Constraints', 'Environment assumptions, timebox, and operator objectives.'),
      newSectionBlock('Information Gathering', 'Document scans, service notes, and host fingerprinting.'),
      newCodeBlock('Host Enumeration', 'nmap -Pn -sC -sV -oA scans/host {{sessionTarget}}', 'bash'),
      newSectionBlock('Initial Access', 'Capture the vulnerable surface, exploit chain, and proof.'),
      newSectionBlock('Privilege Escalation', 'Capture post-exploitation, local enumeration, and escalation proof.'),
      newImageBlock('Privilege Escalation Evidence', '', 'Privilege escalation screenshot', 'Attach the key escalation evidence.', '', { layout: 'full' }),
      newSectionBlock('Flags / Proof', '```text\nlocal.txt = \nproof.txt = \n```'),
      newSectionBlock('Remediation Priorities', '- Immediate fixes\n- Longer-term hardening\n- Monitoring opportunities'),
    ],
  },
];

export function listBuiltInReportTemplatePacks({ format = null } = {}) {
  return BUILT_IN_PACKS
    .filter((pack) => !format || pack.format === format)
    .map((pack) => ({
      id: `system:${pack.packId}`,
      sessionId: null,
      name: pack.name,
      description: pack.description,
      format: pack.format,
      content: '',
      contentJson: cloneBlocks(pack.blocks),
      createdAt: null,
      updatedAt: null,
      scope: 'system',
      packId: pack.packId,
    }));
}

export function isBuiltInReportTemplateId(value) {
  return String(value || '').startsWith('system:');
}

