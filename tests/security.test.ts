import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, test, vi } from 'vitest';
import { collectFiles, MAX_FILE_SIZE } from '../src/collector';
import { loadConfig, MAX_MAX_FILES, MAX_TOKEN_BUDGET } from '../src/config';
import { resolveRepositoryRoot } from '../src/security';
import extension from '../index';

async function withTempDir(run: (dir: string) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-map-security-'));
  try { await run(dir); } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

describe('repository boundary', () => {
  test('collects nested files but ignores every symlink and oversized file', async () => {
    await withTempDir(async dir => {
      await fs.mkdir(path.join(dir, 'src'));
      await fs.writeFile(path.join(dir, 'src', 'ok.ts'), 'export const ok = 1');
      await fs.writeFile(path.join(dir, 'large.ts'), 'x'.repeat(MAX_FILE_SIZE + 1));
      const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-map-outside-'));
      try {
        await fs.writeFile(path.join(outside, 'outside.ts'), 'export const secret = 1');
        await fs.symlink(path.join(outside, 'outside.ts'), path.join(dir, 'external.ts'));
        await fs.symlink(outside, path.join(dir, 'external-dir'));
        await fs.symlink(path.join(dir, 'src', 'ok.ts'), path.join(dir, 'inside.ts'));
        const files = await collectFiles(dir, { maxFiles: 100, excludedDirs: [] });
        expect(files.map(file => file.relativePath)).toEqual(['src/ok.ts']);
      } finally { await fs.rm(outside, { recursive: true, force: true }); }
    });
  });

  test('rejects filesystem root and home directory', async () => {
    expect(await resolveRepositoryRoot(path.parse(process.cwd()).root)).toBeNull();
    expect(await resolveRepositoryRoot(os.homedir())).toBeNull();
  });
});

describe('untrusted config and extension surface', () => {
  test('invalid config values fall back and permanent exclusions remain', async () => {
    await withTempDir(async dir => {
      await fs.mkdir(path.join(dir, '.pi'));
      await fs.writeFile(path.join(dir, '.pi', 'repo-map.json'), JSON.stringify({
        enabled: 'true', tokenBudget: 999999999, maxFiles: -1,
        excludedDirs: ['foo', '..', 'foo/bar', 'foo\\bar', 'bad\u0001'], unknown: true,
      }));
      const config = await loadConfig(dir);
      expect(config.enabled).toBe(true);
      expect(config.tokenBudget).toBeLessThanOrEqual(MAX_TOKEN_BUDGET);
      expect(config.maxFiles).toBeLessThanOrEqual(MAX_MAX_FILES);
      expect(config.excludedDirs).toContain('.git');
      expect(config.excludedDirs).toContain('foo');
      expect(config.excludedDirs).not.toContain('..');
    });
  });

  test('does not register a model-callable tool', () => {
    const pi = { on: vi.fn(), registerCommand: vi.fn(), registerFlag: vi.fn(), registerTool: vi.fn(), getFlag: vi.fn() } as any;
    extension(pi);
    expect(pi.registerTool).not.toHaveBeenCalled();
  });
});
