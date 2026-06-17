// AI-7 (Phase 1) — Trích text từ .doc nhị phân (OLE2). mammoth KHÔNG đọc .doc → dùng LibreOffice
// headless convert .doc → .docx rồi mammoth/extractDocxText. KHÔNG ném (route không vỡ).
// - timeout 20s, kill process nếu treo.
// - mutex 1 job/lần (tránh LibreOffice lock profile khi gọi đồng thời).
// - spawn ARGS (không ghép shell string).
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { extractDocxText } from './docxExtractor';

export interface DocExtractResult {
  ok: boolean;
  text: string;
  charCount: number;
  reason?: string;
}

const CONVERT_TIMEOUT_MS = 20_000;

// Dò soffice/libreoffice 1 lần (cache). null = chưa cài.
let _soffice: string | null | undefined;
function whichCmd(cmd: string): Promise<string | null> {
  return new Promise((resolve) => {
    const p = spawn('which', [cmd]);
    let out = '';
    p.stdout.on('data', (d) => (out += d.toString()));
    p.on('error', () => resolve(null));
    p.on('close', (code) => resolve(code === 0 && out.trim() ? out.trim().split('\n')[0] : null));
  });
}
async function resolveSoffice(): Promise<string | null> {
  if (_soffice !== undefined) return _soffice;
  _soffice = (await whichCmd('soffice')) ?? (await whichCmd('libreoffice'));
  return _soffice;
}

// Mutex 1 job/lần.
let _lock: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = _lock.then(() => fn());
  _lock = result.catch(() => undefined);
  return result;
}

function runSoffice(soffice: string, args: string[]): Promise<{ ok: boolean; reason?: string }> {
  return new Promise((resolve) => {
    const child = spawn(soffice, args, { stdio: 'ignore' });
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
      resolve({ ok: false, reason: 'convert-timeout' });
    }, CONVERT_TIMEOUT_MS);
    child.on('error', (e) => { clearTimeout(timer); resolve({ ok: false, reason: `spawn-error: ${e.message}` }); });
    child.on('close', (code) => { clearTimeout(timer); resolve(code === 0 ? { ok: true } : { ok: false, reason: `soffice-exit-${code}` }); });
  });
}

/** Convert .doc → .docx (LibreOffice) → mammoth. BEST-EFFORT. */
export async function extractDocText(buffer: Buffer, maxChars: number): Promise<DocExtractResult> {
  const soffice = await resolveSoffice();
  if (!soffice) {
    return { ok: false, text: '', charCount: 0, reason: 'libreoffice-not-installed' };
  }
  return withLock(async () => {
    let tmp = '';
    try {
      tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dms-doc-'));
      const inPath = path.join(tmp, 'input.doc');
      const profile = path.join(tmp, 'profile'); // profile riêng → tránh lock giữa các lần gọi
      await fs.writeFile(inPath, buffer);
      const run = await runSoffice(soffice, [
        '--headless', '--norestore',
        `-env:UserInstallation=file://${profile}`,
        '--convert-to', 'docx', '--outdir', tmp, inPath,
      ]);
      if (!run.ok) {
        return { ok: false, text: '', charCount: 0, reason: run.reason ?? 'convert-failed' };
      }
      const outPath = path.join(tmp, 'input.docx');
      const outBuf = await fs.readFile(outPath).catch(() => null);
      if (!outBuf) {
        return { ok: false, text: '', charCount: 0, reason: 'convert-no-output' };
      }
      const ab = outBuf.buffer.slice(outBuf.byteOffset, outBuf.byteOffset + outBuf.byteLength);
      const ex = await extractDocxText(ab, 'converted.docx');
      const text = ex.text.slice(0, maxChars);
      return { ok: text.length > 0, text, charCount: text.length, reason: text ? undefined : (ex.skipped ?? 'empty') };
    } catch (e) {
      return { ok: false, text: '', charCount: 0, reason: `doc-extract-error: ${e instanceof Error ? e.message : String(e)}` };
    } finally {
      if (tmp) { await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined); }
    }
  });
}
