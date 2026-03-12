import { spawn } from 'node:child_process';
import {
  addTimelineEvent,
  createCredentialVerification,
  getCredential,
  getGraphState,
  listCredentialVerifications,
  updateCredentialVerification,
  updateTimelineEvent,
} from '@/lib/db';
import { buildCommandOutput } from '@/lib/execute-service';
import { publishExecutionStreamEvent } from '@/lib/execution-stream';
import { isToolAvailable } from '@/lib/tool-availability';

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function asNumber(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function clipText(value, max = 320) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function parseServiceLabel(label = '') {
  const match = String(label || '').trim().match(/^([a-z0-9._-]+):(\d+)\/(tcp|udp)$/i);
  if (!match) return { service: '', port: null, protocol: 'tcp' };
  return {
    service: String(match[1] || '').toLowerCase(),
    port: Number(match[2] || 0) || null,
    protocol: String(match[3] || 'tcp').toLowerCase(),
  };
}

function collectServiceTargets(graphState = {}) {
  const nodes = Array.isArray(graphState?.nodes) ? graphState.nodes : [];
  const edges = Array.isArray(graphState?.edges) ? graphState.edges : [];
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const targets = [];

  for (const edge of edges) {
    if (String(edge?.label || '').toLowerCase() !== 'found') continue;
    const hostNode = nodeMap.get(edge.source);
    const serviceNode = nodeMap.get(edge.target);
    if (!hostNode || !serviceNode) continue;

    const details = serviceNode?.data?.details || {};
    const parsed = parseServiceLabel(serviceNode?.data?.label);
    const host = String(hostNode?.data?.label || '').trim();
    const service = String(details?.service || serviceNode?.data?.service || parsed.service || '').trim().toLowerCase();
    const port = asNumber(details?.port ?? serviceNode?.data?.port ?? parsed.port);
    if (!host || !service) continue;

    targets.push({
      host,
      port,
      service,
      sourceNodeIds: [hostNode.id, serviceNode.id],
    });
  }

  const dedup = new Map();
  for (const target of targets) {
    const key = `${target.host}:${target.port || ''}:${target.service}`;
    if (!dedup.has(key)) {
      dedup.set(key, target);
    }
  }
  return [...dedup.values()];
}

function redactSecret(secret = '') {
  return secret ? '***' : '';
}

function buildCommandSpec(target, credential) {
  const username = String(credential?.username || '').trim();
  const secret = String(credential?.secret || '').trim();
  const host = String(target?.host || '').trim();
  const port = asNumber(target?.port);
  const service = String(target?.service || '').trim().toLowerCase();

  if (!host || !service) return null;

  if (service === 'smb') {
    if (!username || !secret || !isToolAvailable('smbclient')) return null;
    return {
      binary: 'smbclient',
      args: ['-L', `//${host}`, '-p', String(port || 445), '-U', `${username}%${secret}`],
      displayCommand: `smbclient -L //${host} -p ${port || 445} -U ${username}%${redactSecret(secret)}`,
    };
  }

  if (service === 'ldap') {
    if (!username || !secret || !isToolAvailable('ldapsearch')) return null;
    return {
      binary: 'ldapsearch',
      args: ['-x', '-H', `ldap://${host}:${port || 389}`, '-D', username, '-w', secret, '-b', '', '-s', 'base', 'namingContexts'],
      displayCommand: `ldapsearch -x -H ldap://${host}:${port || 389} -D ${username} -w ${redactSecret(secret)} -b "" -s base namingContexts`,
    };
  }

  if (service === 'ftp') {
    if (!username || !secret || !isToolAvailable('curl')) return null;
    return {
      binary: 'curl',
      args: ['--silent', '--show-error', '--fail', '--user', `${username}:${secret}`, `ftp://${host}:${port || 21}/`],
      displayCommand: `curl --silent --show-error --fail --user ${username}:${redactSecret(secret)} ftp://${host}:${port || 21}/`,
    };
  }

  return null;
}

function buildAdvisoryCommand(target, credential) {
  const username = String(credential?.username || '').trim() || '<user>';
  const secret = String(credential?.secret || '').trim() || '<secret>';
  const host = String(target?.host || '').trim();
  const port = asNumber(target?.port);
  const service = String(target?.service || '').trim().toLowerCase();

  if (!host || !service) return '';
  if (service === 'http') {
    return `curl -I -u ${username}:${secret} http://${host}${port && port !== 80 ? `:${port}` : ''}/`;
  }
  if (service === 'https') {
    return `curl -k -I -u ${username}:${secret} https://${host}${port && port !== 443 ? `:${port}` : ''}/`;
  }
  if (service === 'ssh') {
    return `nmap -Pn -p ${port || 22} --script ssh-auth-methods ${host}`;
  }
  if (service === 'mysql') {
    return `nmap -Pn -p ${port || 3306} --script mysql-info ${host}`;
  }
  if (service === 'mssql') {
    return `nmap -Pn -p ${port || 1433} --script ms-sql-info ${host}`;
  }
  return '';
}

function chooseTargets(mode, credential, discoveredTargets) {
  const candidates = discoveredTargets.filter((target) => {
    if (credential?.host && String(credential.host).trim() && String(credential.host).trim() !== target.host) {
      return false;
    }
    if (credential?.service && String(credential.service).trim()) {
      return String(credential.service).trim().toLowerCase() === target.service;
    }
    if (credential?.port && asNumber(credential.port)) {
      return asNumber(credential.port) === target.port;
    }
    return true;
  });

  if (mode === 'blast-radius') {
    return candidates.length > 0 ? candidates : discoveredTargets;
  }

  if (candidates.length > 0) {
    return [candidates[0]];
  }

  if (credential?.host || credential?.service || credential?.port) {
    return [{
      host: String(credential?.host || '').trim(),
      port: asNumber(credential?.port),
      service: String(credential?.service || '').trim().toLowerCase(),
      sourceNodeIds: Array.isArray(credential?.graphNodeIds) ? credential.graphNodeIds : [],
    }].filter((item) => item.host && item.service);
  }

  return [];
}

export function buildCredentialVerificationPlan({ sessionId, credentialId, mode = 'single' }) {
  const credential = getCredential(sessionId, credentialId);
  if (!credential) {
    return { credential: null, jobs: [] };
  }

  const graphState = getGraphState(sessionId);
  const discoveredTargets = collectServiceTargets(graphState);
  const targets = chooseTargets(mode, credential, discoveredTargets);

  const jobs = targets.map((target) => {
    const commandSpec = buildCommandSpec(target, credential);
    const advisoryCommand = buildAdvisoryCommand(target, credential);
    return {
      target,
      sourceNodeIds: target.sourceNodeIds,
      autoRun: Boolean(commandSpec),
      advisoryCommand,
      commandSpec,
      summary: commandSpec
        ? `Verification queued for ${target.service} on ${target.host}:${target.port || ''}`.trim()
        : `Advisory-only target for ${target.service} on ${target.host}:${target.port || ''}`.trim(),
    };
  });

  return { credential, jobs };
}

function runToolCommand({ binary, args }) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(binary, args, {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      resolve({ ok: false, stdout: '', stderr: String(error?.message || error), code: null, signal: null });
      return;
    }

    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore best-effort timeout kill
      }
    }, 15000);

    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
    child.once('error', (error) => {
      clearTimeout(timeout);
      resolve({ ok: false, stdout, stderr: stderr || String(error?.message || error), code: null, signal: null });
    });
    child.once('close', (code, signal) => {
      clearTimeout(timeout);
      resolve({
        ok: code === 0 && !signal,
        stdout,
        stderr,
        code,
        signal,
      });
    });
  });
}

function evaluateVerificationMatch(service, result) {
  if (!result?.ok) return false;
  const output = `${result.stdout || ''}\n${result.stderr || ''}`.toLowerCase();
  const negativePatterns = [
    /invalid credentials/,
    /login failed/,
    /logon failure/,
    /access denied/,
    /authentication failed/,
    /530 /,
    /bind failed/,
  ];
  if (negativePatterns.some((pattern) => pattern.test(output))) {
    return false;
  }

  return ['smb', 'ldap', 'ftp'].includes(String(service || '').toLowerCase());
}

async function createLiveVerification(sessionId, credential, job, mode) {
  const verification = createCredentialVerification(sessionId, {
    credentialId: credential.id,
    mode,
    targetHost: job.target.host,
    targetPort: job.target.port,
    targetService: job.target.service,
    command: job.commandSpec.displayCommand,
    status: 'running',
    summary: job.summary,
  });
  if (!verification) return null;

  const timelineEvent = addTimelineEvent(sessionId, {
    type: 'command',
    command: job.commandSpec.displayCommand,
    status: 'running',
    output: '',
    tags: ['credential-verification', `credential:${credential.id}`, `verification:${verification.id}`],
  });

  const verificationWithEvent = updateCredentialVerification(verification.id, {
    commandEventId: timelineEvent?.id || null,
  });

  if (timelineEvent) {
    publishExecutionStreamEvent(sessionId, {
      type: 'state',
      event: timelineEvent,
    });
  }

  const result = await runToolCommand(job.commandSpec);
  const output = buildCommandOutput(result.stdout, result.stderr);
  const matched = evaluateVerificationMatch(job.target.service, result);
  const finalStatus = matched ? 'matched' : 'failed';
  const summary = matched
    ? `Credentials matched ${job.target.service} on ${job.target.host}:${job.target.port || ''}`.trim()
    : clipText(output, 320) || `Credentials did not match ${job.target.service} on ${job.target.host}`.trim();

  if (timelineEvent) {
    const updatedEvent = updateTimelineEvent(sessionId, timelineEvent.id, {
      status: result.ok ? 'success' : 'failed',
      output,
    });
    publishExecutionStreamEvent(sessionId, {
      type: 'state',
      event: updatedEvent || {
        ...timelineEvent,
        status: result.ok ? 'success' : 'failed',
        output,
      },
    });
  }

  return updateCredentialVerification(verificationWithEvent?.id || verification.id, {
    status: finalStatus,
    matched,
    summary,
    completedAt: new Date().toISOString(),
  });
}

function createAdvisoryVerification(sessionId, credential, job, mode) {
  return createCredentialVerification(sessionId, {
    credentialId: credential.id,
    mode,
    targetHost: job.target.host,
    targetPort: job.target.port,
    targetService: job.target.service,
    advisoryCommand: job.advisoryCommand,
    status: 'advisory',
    matched: null,
    summary: job.advisoryCommand
      ? `Advisory-only target. Suggested command: ${job.advisoryCommand}`
      : `Advisory-only target for ${job.target.service} on ${job.target.host}`,
    completedAt: new Date().toISOString(),
  });
}

export async function executeCredentialVerificationPlan({ sessionId, credentialId, mode = 'single' }) {
  const plan = buildCredentialVerificationPlan({ sessionId, credentialId, mode });
  if (!plan.credential) {
    return { credential: null, results: [] };
  }

  const results = [];
  for (const job of plan.jobs) {
    if (job.autoRun && job.commandSpec) {
      results.push(await createLiveVerification(sessionId, plan.credential, job, mode));
    } else {
      results.push(createAdvisoryVerification(sessionId, plan.credential, job, mode));
    }
  }

  return {
    credential: getCredential(sessionId, credentialId),
    results: results.filter(Boolean),
    history: listCredentialVerifications(sessionId, { credentialId }),
  };
}
