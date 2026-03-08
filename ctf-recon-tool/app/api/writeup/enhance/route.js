import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { isApiTokenValid } from '@/lib/security';

// ── Skill system prompts (derived from ctf-writeups/.gemini/skills) ─────────

const SKILL_PROMPTS = {
  enhance: `You are an expert CTF (Capture The Flag) security analyst and technical writer.
Given a raw reconnaissance report in Markdown format, enhance it by adding:
1. An **Executive Summary** section at the top (2-4 sentences describing what was found)
2. A **Key Findings** section listing the most important discoveries as bullet points
3. A **Risk Assessment** section identifying potential vulnerabilities based on command outputs
4. A **Recommended Next Steps** section with specific actionable follow-up commands or techniques
Keep the original report content intact below your additions, separated by a horizontal rule.
Be concise and technical. Focus on security-relevant findings.`,

  'writeup-refiner': `You are an expert CTF technical writer applying the Granular Guided Standard.
Given a CTF writeup or reconnaissance report, restructure and enhance it so that:
1. Every major action is a numbered step with four mandatory sub-sections:
   - **Goal**: What are we trying to achieve?
   - **Reasoning**: Why this approach / why this tool?
   - **Execution**: The exact commands or code snippets
   - **Observation**: The specific output, signal, or resulting state
2. The writeup contains these sections (create any that are missing):
   - ## TL;DR (1-2 sentence solution summary)
   - ## Summary of Major Findings (critical discoveries, credentials, flags)
   - ## Information Gathering (initial triage steps)
   - ## Exploitation (granular numbered steps with Goal/Reasoning/Execution/Observation)
   - ## Flag / Password (final secret in a code block)
   - ## Reusable Improvements (patterns or scripts worth keeping)
Preserve all original technical content. Add structure and context where missing. Be precise and reproducible.`,

  report: `You are an expert pentest report writer producing a professional, certification-compliant report.
Given reconnaissance notes and findings, format them as a structured pentest report containing:
1. **Executive Summary** — 2-4 sentences of business-impact narrative (non-technical audience)
2. **Scope & Methodology** — target, testing dates, approach used
3. **Findings** — for each finding: Title, Severity (Critical/High/Medium/Low/Info), Description, Evidence (command output or screenshot reference), Impact, Remediation
4. **Attack Path** — numbered chain of events from initial access to objective
5. **Remediation Summary** — prioritized table of all findings with fix guidance
6. **Conclusion** — overall risk posture statement
Use clear, evidence-backed technical language. Include risk ratings and actionable remediation for each finding.`,

  'web-solve': `You are an expert web application security analyst for CTF challenges.
Given a writeup or notes for a web challenge, enhance it by:
1. **Fingerprint**: Identify the technology stack (server headers, framework, CMS) and attack surface
2. **Vulnerability Assessment**: Rate the most likely vulnerability classes in priority order:
   - LFI/RFI → php://filter wrappers first, then data:// and /proc/self/environ
   - SQL Injection → manual test then sqlmap
   - SSTI → {{7*7}} probe, then Jinja2/Twig/Freemarker RCE payload
   - JWT Attacks → alg:none, weak secret (hashcat rockyou), RS256→HS256 confusion
   - SSRF → internal service probing, file:// access
   - File Upload → magic byte + double extension bypass
   - Command Injection → ; | && || %0a separators
3. **Payloads**: Provide specific copy-paste commands and payloads for the identified vectors
4. **Attack Path**: Document the complete exploit chain from discovery to flag
Structure each step with Goal, Reasoning, Execution, Observation.`,

  privesc: `You are an expert privilege escalation specialist for CTF machines.
Given shell access notes or a reconnaissance writeup, enhance it by:
1. **Current Access**: Summarize the current user, groups, and capabilities
2. **Enumeration Commands**: Provide the exact commands to run (LinPEAS/WinPEAS first, then manual checks)
3. **Linux Vectors** (if applicable — check each in order):
   - Sudo misconfigs: sudo -l → GTFOBins lookup
   - SUID binaries: find / -perm -u=s → GTFOBins lookup
   - Capabilities: getcap -r /
   - Cron jobs: writable scripts, wildcard injection
   - Writable service/config files: /etc/passwd, systemd units
   - PATH hijacking: writable PATH directories
   - Kernel CVEs: uname -a → DirtyPipe, PwnKit, DirtyCow
4. **Windows Vectors** (if applicable):
   - SeImpersonatePrivilege → PrintSpoofer / GodPotato
   - Unquoted service paths → wmic service get
   - AlwaysInstallElevated → registry check
   - Stored credentials → cmdkey /list
5. **Exploitation**: Provide the exact exploitation commands for the identified vector
Structure with Goal, Reasoning, Execution, Observation for each step.`,

  'crypto-solve': `You are an expert cryptography analyst for CTF challenges.
Given ciphertext, encoded data, or cryptographic notes, enhance the writeup by:
1. **Identification**: Determine the encoding or cipher type using pattern matching:
   - Base64/Base32/Hex/URL encoding → attempt immediate decode
   - Classical ciphers → Caesar/ROT brute-force or Vigenere frequency analysis
   - RSA → check for small-e attacks, Wiener's attack, factordb.com
   - XOR → single-byte brute-force checking ASCII printability
   - AES/Block cipher → identify mode (ECB repeating blocks, CBC padding oracle, CTR nonce reuse)
   - Hash → identify with hashid, crack with hashcat/john + rockyou
2. **Attack Path**: Describe the exact attack applied with Python code or commands
3. **Solution Script**: Provide a complete, working Python script in a code block
4. **Flag/Result**: Show the decoded output in a code block
Include frequency analysis results, key recovery steps, and any mathematical derivations.`,

  'pwn-solve': `You are an expert binary exploitation analyst for CTF challenges.
Given binary analysis notes or a pwn challenge writeup, enhance it by:
1. **Binary Triage**: Summarize the protections (checksec output):
   - RELRO → GOT overwrite viability
   - Stack canary → direct BOF or canary bypass needed
   - NX → shellcode vs ROP chain
   - PIE → fixed or leaked base address
2. **Vulnerability**: Identify the vuln type (BOF/format string/heap/UAF) and offset
3. **Exploit Strategy** based on protections:
   - NX off → shellcode at known buffer address
   - PIE off + NX on → ret2plt / GOT overwrite
   - PIE on + leak → libc base leak → ROP chain → one_gadget
   - Format string → GOT overwrite with %n writes
4. **Pwntools Script**: Provide a complete exploit.py using pwntools with all phases:
   - Offset finding (cyclic pattern)
   - Libc leak (if needed)
   - Shell payload
5. **Flag**: Show the captured flag
Structure with Goal, Reasoning, Execution, Observation.`,

  'reversing-solve': `You are an expert reverse engineering analyst for CTF challenges.
Given binary analysis notes or a reversing challenge writeup, enhance it by:
1. **Static Triage**: file, strings, language fingerprint (Rust/__rust_, Go/goroutine, .NET/Java)
2. **Control Flow Analysis**: Key functions identified via Ghidra/r2/ltrace, the flag-check algorithm
3. **Algorithm Pattern**: Identify the check type:
   - strcmp(input, hardcoded) → extract string
   - XOR key loop → extract key + ciphertext, XOR to recover flag
   - Character-by-character cmp → extract each compared byte
   - Hash check → hashcat/john offline brute
   - Rust closure pattern → extract 'cmp dil, <char>' per closure
4. **Solver Script**: Provide complete Python/bash solver code in a code block
5. **Validation**: Confirm the flag validates in the binary
6. **Flag**: Final recovered value in a code block
Structure with Goal, Reasoning, Execution, Observation for each step.`,

  stego: `You are an expert steganography analyst for CTF challenges.
Given notes or a partial writeup about a steganography challenge, enhance it by applying a systematic analysis:
1. **Baseline**: file type, exiftool metadata, magic bytes, MIME vs extension match
2. **Trailing Data**: check for data after IEND (PNG), FFD9 (JPEG), or end markers
3. **LSB Analysis**: zsteg (PNG/BMP), stegoveritas, stegsolve bit planes
4. **Password-Protected Stego**: steghide with empty/common passwords, stegseek with rockyou
5. **Audio** (if WAV/MP3): spectrogram analysis (sox), DTMF/Morse detection, audio LSB
6. **Embedded Files**: binwalk entropy + extraction, foremost carving
7. **Structured Output**:
   | Check | Result | Confidence |
   |---|---|---|
   | Trailing data | yes/no | high/med |
   | LSB content | detected/clean | high/med |
   ... (one row per check)
Provide exact commands for each check. Note every positive finding. Give prioritized next steps.`,

  'analyze-file': `You are an expert forensic file analyst for CTF challenges.
Given an unknown file or forensic artifact, enhance the writeup with a complete triage:
1. **File Type Detection**: magic bytes (xxd), file command output, extension vs real type mismatch
2. **Metadata/EXIF**: author, GPS, software, timestamps, custom fields (exiftool)
3. **String Analysis**: flags, URLs, base64 blobs, passwords, embedded commands (strings -n 6)
4. **Entropy & Structure**: binwalk entropy scan — high entropy = encrypted/compressed, signatures = embedded files
5. **Embedded Files**: binwalk -e extraction, foremost carving if needed
6. **Type-Specific Checks**:
   - Images: LSB stego (zsteg), trailing data after IEND/EOI
   - PDFs: pdfid.py for /JS /Launch /EmbeddedFile, pdftotext
   - Archives: 7z l, unzip -l
7. **Structured Summary**:
   | Property | Value |
   |---|---|
   | File type | |
   | Magic bytes | |
   | Extension match | yes/no |
   ...
Provide exact commands used and their output. Highlight every security-relevant finding.`,

  'enum-target': `You are an expert CTF enumeration planner.
Given recon notes or a partial writeup, enhance it with a comprehensive, prioritized enumeration plan:
1. **Initial Scan Commands** (always first):
   - Fast port discovery: nmap -sS -p- --min-rate 5000
   - Service + script scan on discovered ports: nmap -sC -sV -p <PORTS>
   - UDP top 20: sudo nmap -sU --top-ports 20
2. **Per-Service Enumeration** based on discovered ports:
   - HTTP/HTTPS: whatweb, gobuster dir, ffuf, gobuster vhost, nikto
   - SSH: nmap --script ssh-auth-methods
   - DNS: dig axfr, dnsrecon
   - SMB: smbclient -L, enum4linux-ng, crackmapexec, smbmap
   - FTP: anonymous login check, ftp-anon nmap script
   - SNMP: snmpwalk -v2c -c public, onesixtyone
   - LDAP: ldapsearch -x, nmap --script ldap-rootdse
   - MySQL: nmap --script mysql-info, mysql -u root
3. **Output as Prioritized Checklist**:
   ### Phase 1 — Port Discovery
   - [ ] Full TCP scan
   ### Phase 2 — Service Enumeration
   - [ ] <service>: <exact command>
   ### Phase 3 — Deep Dive
   - [ ] Web content discovery
   - [ ] Credential checks
4. **Quick Reference Table**: Port | Service | Priority | First Command
Generate specific commands with actual placeholders replaced where values are known from the notes.`,
};

const REPORT_SKILLS = new Set(['enhance', 'writeup-refiner', 'report']);

const STREAM_HEADERS = {
  'Content-Type': 'text/plain; charset=utf-8',
  'Transfer-Encoding': 'chunked',
  'X-Content-Type-Options': 'nosniff',
};

function makeStream(generatorFn) {
  const encoder = new TextEncoder();
  return new NextResponse(
    new ReadableStream({
      async start(controller) {
        try {
          for await (const text of generatorFn()) {
            controller.enqueue(encoder.encode(text));
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    }),
    { headers: STREAM_HEADERS }
  );
}

async function* streamClaude(reportContent, apiKey, systemPrompt) {
  const client = new Anthropic({ apiKey: apiKey || process.env.ANTHROPIC_API_KEY });
  const stream = client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content: `Here is the reconnaissance report to enhance:\n\n${reportContent}` }],
  });
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      yield event.delta.text;
    }
  }
}

async function* streamGemini(reportContent, apiKey, systemPrompt) {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: apiKey || process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContentStream({
    model: 'gemini-2.5-flash',
    contents: `Here is the reconnaissance report to enhance:\n\n${reportContent}`,
    config: { systemInstruction: systemPrompt, maxOutputTokens: 2048 },
  });
  for await (const chunk of response) {
    if (chunk.text) yield chunk.text;
  }
}

async function* streamOpenAI(reportContent, apiKey, systemPrompt) {
  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({ apiKey: apiKey || process.env.OPENAI_API_KEY });
  const stream = await client.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 2048,
    stream: true,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Here is the reconnaissance report to enhance:\n\n${reportContent}` },
    ],
  });
  for await (const chunk of stream) {
    const text = chunk.choices?.[0]?.delta?.content;
    if (text) yield text;
  }
}

async function completeClaude(userContent, apiKey, systemPrompt) {
  const client = new Anthropic({ apiKey: apiKey || process.env.ANTHROPIC_API_KEY });
  const resp = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3072,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  });
  const textBlocks = resp.content?.filter(c => c.type === 'text').map(c => c.text) || [];
  return textBlocks.join('\n');
}

async function completeGemini(userContent, apiKey, systemPrompt) {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: apiKey || process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: userContent,
    config: { systemInstruction: systemPrompt, maxOutputTokens: 3072 },
  });
  return response.text || '';
}

async function completeOpenAI(userContent, apiKey, systemPrompt) {
  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({ apiKey: apiKey || process.env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 3072,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
  });
  return response.choices?.[0]?.message?.content || '';
}

function extractJsonObject(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (_) {
    return null;
  }
}

export async function POST(request) {
  try {
    if (!isApiTokenValid(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const {
      reportContent,
      provider = 'claude',
      apiKey = '',
      skill = 'enhance',
      mode = 'stream',
      reportBlocks = [],
      selectedSectionIds = [],
      evidenceContext = '',
    } = await request.json();
    if (!reportContent) {
      return NextResponse.json({ error: 'reportContent is required' }, { status: 400 });
    }

    if (!REPORT_SKILLS.has(skill)) {
      return NextResponse.json(
        { error: `Unsupported reporter skill "${skill}". Allowed: enhance, writeup-refiner, report.` },
        { status: 400 }
      );
    }

    const systemPrompt = SKILL_PROMPTS[skill] || SKILL_PROMPTS.enhance;

    const key = apiKey || (
      provider === 'gemini'
        ? process.env.GEMINI_API_KEY
        : provider === 'openai'
          ? process.env.OPENAI_API_KEY
          : process.env.ANTHROPIC_API_KEY
    );
    if (!key) {
      const providerName = provider === 'openai' ? 'OpenAI' : provider === 'gemini' ? 'Gemini' : 'Anthropic';
      return NextResponse.json({ error: `${providerName} API key required.` }, { status: 503 });
    }

    if (mode === 'section-patch') {
      const selected = Array.isArray(selectedSectionIds) ? selectedSectionIds : [];
      const blocks = Array.isArray(reportBlocks) ? reportBlocks : [];
      const targetBlocks = blocks.filter(b => selected.length === 0 || selected.includes(b.id));
      if (targetBlocks.length === 0) {
        return NextResponse.json({ mode: 'section-patch', patches: [] });
      }

      const compactBlocks = targetBlocks.map(block => ({
        id: block.id,
        blockType: block.blockType,
        title: block.title || '',
        content: block.content || '',
        caption: block.caption || '',
        alt: block.alt || '',
        imageUrl: block.imageUrl || '',
      }));

      const patchPrompt = `You are editing selected report blocks.
Return ONLY valid JSON with this shape:
{
  "patches": [
    {
      "sectionId": "existing-block-id",
      "title": "optional updated title",
      "content": "updated markdown/text content",
      "caption": "optional image caption",
      "alt": "optional image alt text",
      "evidenceRefs": ["timestamp or screenshot name used as evidence"]
    }
  ]
}

Rules:
- Keep sectionId unchanged and match provided IDs.
- Preserve technical accuracy and reproducibility.
- Include evidenceRefs for each patch.
- Do not include markdown code fences around JSON.

Selected blocks:
${JSON.stringify(compactBlocks, null, 2)}

Evidence context:
${evidenceContext || '(none provided)'}`;

      let modelOutput = '';
      if (provider === 'gemini') {
        modelOutput = await completeGemini(patchPrompt, key, systemPrompt);
      } else if (provider === 'openai') {
        modelOutput = await completeOpenAI(patchPrompt, key, systemPrompt);
      } else {
        modelOutput = await completeClaude(patchPrompt, key, systemPrompt);
      }

      const parsed = extractJsonObject(modelOutput);
      let patches = Array.isArray(parsed?.patches) ? parsed.patches : [];
      patches = patches
        .filter(p => p && typeof p.sectionId === 'string' && compactBlocks.some(b => b.id === p.sectionId))
        .map(p => ({
          sectionId: p.sectionId,
          title: typeof p.title === 'string' ? p.title : undefined,
          content: typeof p.content === 'string' ? p.content : undefined,
          caption: typeof p.caption === 'string' ? p.caption : undefined,
          alt: typeof p.alt === 'string' ? p.alt : undefined,
          evidenceRefs: Array.isArray(p.evidenceRefs) ? p.evidenceRefs.map(x => String(x)) : [],
        }));

      // Fallback: if JSON parse fails but we have exactly one selected block, apply raw output to that block.
      if (patches.length === 0 && compactBlocks.length === 1 && modelOutput.trim()) {
        patches = [{
          sectionId: compactBlocks[0].id,
          content: modelOutput.trim(),
          evidenceRefs: [],
        }];
      }

      return NextResponse.json({ mode: 'section-patch', patches });
    }

    if (provider === 'gemini') {
      return makeStream(() => streamGemini(reportContent, key, systemPrompt));
    }

    if (provider === 'openai') {
      return makeStream(() => streamOpenAI(reportContent, key, systemPrompt));
    }

    // Default: claude
    return makeStream(() => streamClaude(reportContent, key, systemPrompt));

  } catch (error) {
    console.error('AI enhance failed:', error);
    return NextResponse.json({ error: 'Enhancement failed' }, { status: 500 });
  }
}
