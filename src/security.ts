// Canonical-path boundary checks for all repository filesystem access.
import * as fs from 'fs/promises';
import { constants as fsConstants } from 'fs';
import * as os from 'os';
import * as path from 'path';

export function isWithinRoot(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export async function resolveRepositoryRoot(cwd: string): Promise<string | null> {
  try {
    const root = await fs.realpath(cwd);
    const home = await fs.realpath(os.homedir()).catch(() => os.homedir());
    if (root === path.parse(root).root || root === home) return null;
    const stat = await fs.lstat(root);
    return stat.isDirectory() && !stat.isSymbolicLink() ? root : null;
  } catch {
    return null;
  }
}

async function verifyPath(root: string, target: string, requireFile: boolean): Promise<boolean> {
  if (!isWithinRoot(root, target)) return false;
  const relative = path.relative(root, target);
  const pieces = relative ? relative.split(path.sep) : [];
  let current = root;
  for (let i = 0; i < pieces.length; i++) {
    current = path.join(current, pieces[i]);
    let stat;
    try { stat = await fs.lstat(current); } catch { return false; }
    if (stat.isSymbolicLink()) return false;
    if (i < pieces.length - 1 && !stat.isDirectory()) return false;
    if (i === pieces.length - 1 && requireFile && !stat.isFile()) return false;
  }
  return !requireFile || pieces.length > 0;
}

export async function isSafeDirectory(root: string, directory: string): Promise<boolean> {
  if (!await verifyPath(root, directory, false)) return false;
  try { return (await fs.lstat(directory)).isDirectory(); } catch { return false; }
}

export async function isSafeRegularFile(root: string, file: string): Promise<boolean> {
  return verifyPath(root, file, true);
}

export async function readSafeRegularFile(root: string, file: string): Promise<string> {
  if (!await isSafeRegularFile(root, file)) throw new Error('Unsafe repository file');
  const noFollow = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0;
  const handle = await fs.open(file, fsConstants.O_RDONLY | noFollow);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || !await isSafeRegularFile(root, file)) throw new Error('Unsafe repository file');
    return await handle.readFile('utf8');
  } finally {
    await handle.close();
  }
}
