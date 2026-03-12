export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export interface ToastInput {
  title: string;
  message?: string | null;
  tone?: ToastTone;
  durationMs?: number;
}

export interface ToastRecord {
  id: string;
  title: string;
  message: string;
  tone: ToastTone;
  durationMs: number;
  createdAt: number;
}

interface ExecutionEventLike {
  id?: string | null;
  command?: string | null;
  output?: string | null;
  status?: string | null;
}

let toastSequence = 0;

function summarizeCommand(command: unknown): string {
  const value = String(command || '').trim();
  if (!value) return '(command)';
  if (value.length <= 64) return value;
  return `${value.slice(0, 61)}...`;
}

function summarizeOutput(output: unknown): string {
  const value = String(output || '').replace(/\s+/g, ' ').trim();
  if (!value) return '';
  if (value.length <= 140) return value;
  return `${value.slice(0, 137)}...`;
}

export function createToastRecord(input: ToastInput): ToastRecord {
  const createdAt = Date.now();
  toastSequence += 1;
  return {
    id: `toast-${createdAt.toString(36)}-${toastSequence.toString(36)}`,
    title: String(input?.title || '').trim() || 'Notification',
    message: String(input?.message || '').trim(),
    tone: input?.tone || 'info',
    durationMs: Number(input?.durationMs || 4200),
    createdAt,
  };
}

export function buildCommandToast(event: ExecutionEventLike | null | undefined): ToastInput | null {
  const status = String(event?.status || '').trim().toLowerCase();
  const command = summarizeCommand(event?.command);

  if (!['success', 'failed', 'timeout', 'cancelled'].includes(status)) {
    return null;
  }

  if (status === 'success') {
    return {
      tone: 'success',
      title: 'Command complete',
      message: command,
      durationMs: 3200,
    };
  }

  if (status === 'cancelled') {
    return {
      tone: 'warning',
      title: 'Command cancelled',
      message: command,
      durationMs: 3200,
    };
  }

  return {
    tone: 'error',
    title: status === 'timeout' ? 'Command timed out' : 'Command failed',
    message: summarizeOutput(event?.output) || command,
    durationMs: 5200,
  };
}

export function buildGraphRefreshToast(reason: unknown): ToastInput {
  const normalizedReason = String(reason || '').trim().toLowerCase();
  if (normalizedReason === 'cve-enrichment') {
    return {
      tone: 'info',
      title: 'CVE enrichment updated',
      message: 'Discovery graph metadata was refreshed with CVE context.',
      durationMs: 3200,
    };
  }

  return {
    tone: 'info',
    title: 'Discovery graph refreshed',
    message: 'New discovery context is available in the graph view.',
    durationMs: 2800,
  };
}
