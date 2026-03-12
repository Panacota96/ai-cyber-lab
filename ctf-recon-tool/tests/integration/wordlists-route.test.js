import fs from 'fs';
import os from 'os';
import path from 'path';
import { GET as wordlistsGet } from '@/api/wordlists/route';

describe('wordlists route', () => {
  let rootDir;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helms-wordlists-'));
    fs.mkdirSync(path.join(rootDir, 'dirb'), { recursive: true });
    fs.writeFileSync(path.join(rootDir, 'dirb', 'common.txt'), 'admin\nlogin\n');
    process.env.CTF_WORDLIST_DIR = rootDir;
  });

  afterEach(() => {
    if (rootDir && fs.existsSync(rootDir)) {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
    delete process.env.CTF_WORDLIST_DIR;
  });

  it('lists the configured root directory', async () => {
    const req = new Request('http://localhost/api/wordlists');
    const res = await wordlistsGet(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.root).toBe(rootDir);
    expect(body.entries.some((entry) => entry.name === 'dirb' && entry.type === 'directory')).toBe(true);
  });

  it('lists nested directories and rejects traversal', async () => {
    const nestedReq = new Request('http://localhost/api/wordlists?path=dirb');
    const nestedRes = await wordlistsGet(nestedReq);
    expect(nestedRes.status).toBe(200);
    const nestedBody = await nestedRes.json();
    expect(nestedBody.entries.some((entry) => entry.name === 'common.txt' && entry.type === 'file')).toBe(true);

    const traversalReq = new Request('http://localhost/api/wordlists?path=..%2F..');
    const traversalRes = await wordlistsGet(traversalReq);
    expect(traversalRes.status).toBe(400);
  });

  it('returns an empty browser state when the configured root does not exist', async () => {
    fs.rmSync(rootDir, { recursive: true, force: true });

    const req = new Request('http://localhost/api/wordlists');
    const res = await wordlistsGet(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      root: rootDir,
      currentPath: '',
      parentPath: null,
      entries: [],
    });
  });
});
