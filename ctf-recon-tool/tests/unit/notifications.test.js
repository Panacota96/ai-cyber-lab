import { describe, expect, it } from 'vitest';
import {
  buildCommandToast,
  buildGraphRefreshToast,
  createToastRecord,
} from '@/lib/notifications';

describe('notifications helpers', () => {
  it('builds a success toast for completed commands', () => {
    expect(buildCommandToast({
      id: 'cmd-1',
      status: 'success',
      command: 'gobuster dir -u http://target',
    })).toMatchObject({
      tone: 'success',
      title: 'Command complete',
      message: 'gobuster dir -u http://target',
    });
  });

  it('builds an error toast for failed commands with summarized output', () => {
    expect(buildCommandToast({
      id: 'cmd-2',
      status: 'failed',
      command: 'curl http://broken.local',
      output: 'Connection refused by remote host',
    })).toMatchObject({
      tone: 'error',
      title: 'Command failed',
      message: 'Connection refused by remote host',
    });
  });

  it('creates stable toast records and discovery-refresh messages', () => {
    const toast = createToastRecord({ title: 'Saved', message: 'Artifact persisted.' });
    expect(toast).toMatchObject({
      title: 'Saved',
      message: 'Artifact persisted.',
      tone: 'info',
    });
    expect(toast.id).toMatch(/^toast-/);

    expect(buildGraphRefreshToast('cve-enrichment')).toMatchObject({
      tone: 'info',
      title: 'CVE enrichment updated',
    });
  });
});
