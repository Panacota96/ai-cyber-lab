import {
  isAdminApiEnabled,
  isApiTokenValid,
  isCommandExecutionEnabled,
  isValidSessionId,
  requireSafeFilename,
  requireValidSessionId,
  resolvePathWithin,
  sanitizeUploadFilename,
} from '@/lib/security';

function makeRequest(headers = {}) {
  return { headers: new Headers(headers) };
}

describe('security helpers', () => {
  let envSnapshot;

  beforeEach(() => {
    envSnapshot = { ...process.env };
  });

  afterEach(() => {
    process.env = envSnapshot;
  });

  it('validates supported session id patterns', () => {
    expect(isValidSessionId('default')).toBe(true);
    expect(isValidSessionId('alpha-01_test')).toBe(true);
    expect(isValidSessionId('')).toBe(false);
    expect(isValidSessionId('bad/id')).toBe(false);
    expect(isValidSessionId('-bad-prefix')).toBe(false);
  });

  it('throws on invalid required session ids', () => {
    expect(() => requireValidSessionId('valid_session')).not.toThrow();
    expect(() => requireValidSessionId('../evil')).toThrow(/Invalid sessionId/);
  });

  it('normalizes upload filenames and rejects unsafe filenames', () => {
    expect(sanitizeUploadFilename(' report final?.png ')).toBe('_report_final_.png_');
    expect(sanitizeUploadFilename('a/b\\c.txt')).toBe('c.txt');
    expect(() => requireSafeFilename('screenshot-1.png')).not.toThrow();
    expect(() => requireSafeFilename('../escape.png')).toThrow(/Invalid filename/);
  });

  it('blocks path traversal outside base directory', () => {
    const base = 'C:/tmp/helms-watch';
    expect(resolvePathWithin(base, 'session', 'file.txt')).toContain('helms-watch');
    expect(() => resolvePathWithin(base, '..', 'escape.txt')).toThrow(/Path traversal rejected/);
  });

  it('validates API token, rotation token, and expiry', () => {
    delete process.env.APP_API_TOKEN;
    delete process.env.APP_API_TOKEN_2;
    expect(isApiTokenValid(makeRequest())).toBe(true);

    process.env.APP_API_TOKEN = 'primary-token';
    process.env.APP_API_TOKEN_2 = 'rotated-token';
    process.env.APP_API_TOKEN_EXPIRES_AT = '2099-12-31T23:59:59Z';
    expect(isApiTokenValid(makeRequest({ 'x-api-token': 'primary-token' }))).toBe(true);
    expect(isApiTokenValid(makeRequest({ 'x-api-token': 'rotated-token' }))).toBe(true);
    expect(isApiTokenValid(makeRequest({ 'x-api-token': 'invalid-token' }))).toBe(false);

    process.env.APP_API_TOKEN_EXPIRES_AT = '2001-01-01T00:00:00Z';
    expect(isApiTokenValid(makeRequest({ 'x-api-token': 'primary-token' }))).toBe(false);
  });

  it('applies execution and admin feature flags by NODE_ENV', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ENABLE_COMMAND_EXECUTION;
    delete process.env.ENABLE_ADMIN_API;
    expect(isCommandExecutionEnabled()).toBe(false);
    expect(isAdminApiEnabled()).toBe(false);

    process.env.ENABLE_COMMAND_EXECUTION = 'true';
    process.env.ENABLE_ADMIN_API = 'true';
    expect(isCommandExecutionEnabled()).toBe(true);
    expect(isAdminApiEnabled()).toBe(true);
  });
});
