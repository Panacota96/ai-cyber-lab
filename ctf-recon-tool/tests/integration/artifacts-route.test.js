import { GET as artifactFileGet } from '@/api/artifacts/[sessionId]/[artifactId]/route';
import { POST as artifactFromTranscriptPost } from '@/api/artifacts/from-transcript/route';
import { GET as artifactsGet, POST as artifactsPost } from '@/api/artifacts/route';
import { createShellSession, appendShellTranscriptChunk } from '@/lib/shell-repository';
import {
  cleanupTestSession,
  createTestSession,
  makeJsonRequest,
  readJson,
  TEST_API_TOKEN,
  TEST_CSRF_TOKEN,
} from '../helpers/test-helpers';

describe('artifacts routes', () => {
  const sessions = [];

  afterEach(() => {
    while (sessions.length > 0) {
      cleanupTestSession(sessions.pop());
    }
  });

  it('uploads artifacts and saves transcript chunks as session artifacts', async () => {
    const session = createTestSession();
    sessions.push(session.id);
    const targetId = session.primaryTargetId;

    const uploadForm = new FormData();
    uploadForm.set('sessionId', session.id);
    uploadForm.set('targetId', targetId);
    uploadForm.set('notes', 'Operator upload');
    uploadForm.set('file', new File([Buffer.from('loot\n', 'utf8')], 'loot.txt', { type: 'text/plain' }));

    const uploadReq = new Request('http://localhost/api/artifacts', {
      method: 'POST',
      headers: new Headers({
        'x-api-token': TEST_API_TOKEN,
        'x-csrf-token': TEST_CSRF_TOKEN,
        cookie: `helms_watch_csrf=${encodeURIComponent(TEST_CSRF_TOKEN)}`,
      }),
      body: uploadForm,
    });
    const uploadRes = await artifactsPost(uploadReq);
    expect(uploadRes.status).toBe(201);
    const uploadPayload = await readJson(uploadRes);
    expect(uploadPayload.artifact.previewKind).toBe('text');
    expect(uploadPayload.artifact.targetId).toBe(targetId);

    const shellSession = createShellSession(session.id, {
      type: 'webshell',
      label: 'Artifact Shell',
      webshellUrl: 'http://example.invalid/shell.php',
    });
    const chunk = appendShellTranscriptChunk(session.id, shellSession.id, {
      direction: 'output',
      content: 'www-data\n',
    });

    const transcriptReq = makeJsonRequest('/api/artifacts/from-transcript', 'POST', {
      sessionId: session.id,
      targetId,
      shellSessionId: shellSession.id,
      sourceTranscriptChunkId: chunk.id,
      filename: 'shell-output.txt',
      notes: 'Saved from transcript',
    }, { auth: true });
    const transcriptRes = await artifactFromTranscriptPost(transcriptReq);
    expect(transcriptRes.status).toBe(201);
    const transcriptPayload = await readJson(transcriptRes);
    expect(transcriptPayload.artifact.kind).toBe('transcript');
    expect(transcriptPayload.artifact.targetId).toBe(targetId);

    const listRes = await artifactsGet(new Request(`http://localhost/api/artifacts?sessionId=${session.id}`));
    expect(listRes.status).toBe(200);
    const listPayload = await readJson(listRes);
    expect(listPayload.artifacts).toHaveLength(2);

    const downloadRes = await artifactFileGet(new Request(`http://localhost/api/artifacts/${session.id}/${transcriptPayload.artifact.id}`), {
      params: Promise.resolve({ sessionId: session.id, artifactId: transcriptPayload.artifact.id }),
    });
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers.get('content-type')).toContain('text/plain');
    const text = await downloadRes.text();
    expect(text).toContain('www-data');
  });
});
