// Based on workflow-extension (ISC License)
// Copyright (c) 2026 popododo0720

import * as fs from 'fs/promises';
import * as path from 'path';
import { SUPPORTED_EXTENSIONS } from './languages';
import { isSafeDirectory, isSafeRegularFile } from './security';

export const MAX_FILE_SIZE = 100 * 1024;
export const MAX_DISCOVERED_FILES = 2000;

export interface FileInfo {
  path: string;
  relativePath: string;
}

export async function collectFiles(
  rootDir: string,
  options: {
    maxFiles: number;
    excludedDirs: string[];
    onProgress?: (current: number) => void;
    signal?: AbortSignal;
  }
): Promise<FileInfo[]> {
  const files: FileInfo[] = [];


  const maxFiles = Math.min(Math.max(1, options.maxFiles), MAX_DISCOVERED_FILES);
  async function walk(dir: string): Promise<void> {
    if (options.signal?.aborted || files.length >= maxFiles || !await isSafeDirectory(rootDir, dir)) return;

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (options.signal?.aborted || files.length >= maxFiles) break;

        const fullPath = path.join(dir, entry.name);

        if (entry.isSymbolicLink()) {
          continue;
        } else if (entry.isDirectory()) {
          const lowerName = entry.name.toLowerCase();
          if (options.excludedDirs.some(dir => lowerName === dir.toLowerCase())) {
            continue;
          }
          await walk(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

          try {
            if (!await isSafeRegularFile(rootDir, fullPath)) continue;
            const stat = await fs.lstat(fullPath);
            if (!stat.isFile() || stat.size > MAX_FILE_SIZE) continue;

            const relativePath = path.relative(rootDir, fullPath);
            files.push({ path: fullPath, relativePath });
            options.onProgress?.(files.length);
          } catch {
            // Skip files we can't stat
          }
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  await walk(rootDir);
  return files;
}
