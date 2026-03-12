import { GET as reportGet } from '@/api/report/route';
import { POST as exportJsonPost } from '@/api/export/json/route';
import { POST as sysreptorHandoffPost } from '@/api/report/handoff/sysreptor/route';
import { createFinding } from '@/lib/db';
import {
  cleanupTestSession,
  createTestSession,
  makeJsonRequest,
  readJson,
} from '../helpers/test-helpers';

describe('Wave 21 reporting routes', () => {
  const sessions = [];

  afterEach(() => {
    while (sessions.length > 0) {
      cleanupTestSession(sessions.pop());
    }
  });

  it('generates executive audience-pack reports without requiring an explicit format', async () => {
    const session = createTestSession({ name: 'Audience pack session' });
    sessions.push(session.id);

    createFinding(session.id, {
      title: 'Critical admin exposure',
      severity: 'high',
      likelihood: 'high',
      description: 'Sensitive admin surface is exposed to unauthenticated users.',
      source: 'manual',
    });

    const res = await reportGet(makeJsonRequest(
      `/api/report?sessionId=${session.id}&audiencePack=executive&analystName=Tester`,
      'GET'
    ));
    const body = await readJson(res);

    expect(res.status).toBe(200);
    expect(body.view.audiencePack).toBe('executive');
    expect(body.view.format).toBe('executive-summary');
    expect(body.report).toContain('# Executive Summary:');
  });

  it('preserves explicit non-audience formats when generating reports', async () => {
    const session = createTestSession({ name: 'Lab report session' });
    sessions.push(session.id);

    createFinding(session.id, {
      title: 'Banner disclosure',
      severity: 'low',
      description: 'Banner leak.',
      source: 'manual',
    });

    const res = await reportGet(makeJsonRequest(
      `/api/report?sessionId=${session.id}&format=lab-report&audiencePack=executive&analystName=Tester`,
      'GET'
    ));
    const body = await readJson(res);

    expect(res.status).toBe(200);
    expect(body.view.format).toBe('lab-report');
    expect(body.report).toContain('Laboratory Report:');
    expect(body.report).not.toContain('# Technical Walkthrough:');
  });

  it('applies report presets in JSON export metadata and resolved format output', async () => {
    const session = createTestSession({ name: 'Preset export session' });
    sessions.push(session.id);

    createFinding(session.id, {
      title: 'Reusable issue',
      severity: 'medium',
      description: 'Testing preset view metadata.',
      source: 'manual',
    });

    const res = await exportJsonPost(makeJsonRequest('/api/export/json', 'POST', {
      sessionId: session.id,
      presetId: 'certification-writeup',
      analystName: 'Tester',
      inlineImages: false,
      reportFilters: {},
    }));
    const body = await readJson(res);

    expect(res.status).toBe(200);
    expect(body.meta.format).toBe('ctf-solution');
    expect(body.meta.audiencePack).toBe('certification');
    expect(body.meta.presetId).toBe('certification-writeup');
    expect(body.report.markdown).toContain('# CTF Solution:');
  });

  it('builds a SysReptor handoff package with CVSS-linked severity output', async () => {
    const session = createTestSession({ name: 'SysReptor session' });
    sessions.push(session.id);

    createFinding(session.id, {
      title: 'Domain admin credential reuse',
      severity: 'low',
      likelihood: 'high',
      cvssScore: 9.1,
      cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H',
      description: 'CVSS severity should override the low manual severity label.',
      source: 'manual',
    });

    const res = await sysreptorHandoffPost(makeJsonRequest('/api/report/handoff/sysreptor', 'POST', {
      sessionId: session.id,
      audiencePack: 'technical',
      analystName: 'Tester',
      reportFilters: {},
    }, { auth: true }));
    const body = await readJson(res);

    expect(res.status).toBe(200);
    expect(body.descriptor.handoffType).toBe('sysreptor');
    expect(body.descriptor.packageName).toContain('sysreptor-handoff');
    expect(body.package.manifest.report.audiencePack).toBe('technical');
    expect(body.package.files['manifest.json']).toContain('helms-watch/sysreptor-handoff-v1');
    expect(body.package.files['report/report.md']).toContain('Technical Walkthrough');

    const findings = JSON.parse(body.package.files['report/findings.json']);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('critical');
    expect(findings[0].severitySource).toBe('cvss');
    expect(findings[0].cvss.score).toBe(9.1);
  });

  it('rejects invalid SysReptor handoff payloads with validation details', async () => {
    const res = await sysreptorHandoffPost(makeJsonRequest('/api/report/handoff/sysreptor', 'POST', {
      sessionId: '../bad',
      audiencePack: 'executive',
    }, { auth: true }));
    const body = await readJson(res);

    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toContain('Validation failed');
    expect(Array.isArray(body.details)).toBe(true);
  });
});
