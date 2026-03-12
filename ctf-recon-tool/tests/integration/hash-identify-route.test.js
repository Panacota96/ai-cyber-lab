import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST as hashIdentifyPost } from '@/api/credentials/hash-identify/route';
import { createCredential, getCredential } from '@/lib/db';
import * as toolAvailability from '@/lib/tool-availability';
import {
  cleanupTestSession,
  createTestSession,
  makeJsonRequest,
  readJson,
} from '../helpers/test-helpers';

describe('/api/credentials/hash-identify route', () => {
  const sessions = [];

  afterEach(() => {
    vi.restoreAllMocks();
    while (sessions.length > 0) {
      cleanupTestSession(sessions.pop());
    }
  });

  it('analyzes a credential hash and persists the best guess when hashType is empty', async () => {
    vi.spyOn(toolAvailability, 'isToolAvailable').mockImplementation((binary) => (
      ['hashcat', 'john'].includes(binary)
    ));

    const session = createTestSession();
    sessions.push(session.id);

    const credential = createCredential(session.id, {
      label: 'Captured AD hash',
      hash: '8846F7EAEE8FB117AD06BDD830B7586C',
      service: 'smb',
      notes: 'Dumped from a domain controller',
    });

    const response = await hashIdentifyPost(makeJsonRequest('/api/credentials/hash-identify', 'POST', {
      sessionId: session.id,
      credentialId: credential.id,
    }, { auth: true }));

    expect(response.status).toBe(200);
    const payload = await readJson(response);
    expect(payload.analysis.bestCandidate).toMatchObject({
      id: 'ntlm',
      label: 'NTLM',
    });
    expect(payload.analysis.bestCandidate.hashcatCommand).toContain('hashcat -m 1000');
    expect(payload.credential).toMatchObject({
      id: credential.id,
      hashType: 'NTLM',
    });

    const persisted = getCredential(session.id, credential.id);
    expect(persisted.hashType).toBe('NTLM');
  });

  it('supports direct hash analysis without requiring a saved credential', async () => {
    vi.spyOn(toolAvailability, 'isToolAvailable').mockReturnValue(false);

    const session = createTestSession();
    sessions.push(session.id);

    const response = await hashIdentifyPost(makeJsonRequest('/api/credentials/hash-identify', 'POST', {
      sessionId: session.id,
      hash: '$1$salt$BSpYmSAZQYBttsZ28Ph1f/',
    }, { auth: true }));

    expect(response.status).toBe(200);
    const payload = await readJson(response);
    expect(payload.credential).toBeNull();
    expect(payload.analysis.bestCandidate).toMatchObject({
      id: 'md5crypt',
      label: 'md5crypt',
    });
  });
});
