// Based on workflow-extension (ISC License)
// Copyright (c) 2026 popododo0720

import { getCachedParse, setCachedParse, type ParseResult } from './cache';
import { collectFiles } from './collector';
import { MAX_TOKEN_BUDGET, MIN_TOKEN_BUDGET } from './config';
import { reportError, reportWarning, type NotifyFn } from './errorReporter';
import { parseFile, initTreeSitter } from './parser';
import { type ProgressCallback } from './progress';
import { processGraph } from './graph';
import { renderRepoMap } from './renderer';
import { readSafeRegularFile, resolveRepositoryRoot } from './security';

export interface RepoMapGenerationConfig {
  tokenBudget: number;
  maxFiles: number;
  excludedDirs: string[];
}

export async function generateRepoMap(
  cwd: string,
  config: RepoMapGenerationConfig,
  notify?: NotifyFn,
  progress?: ProgressCallback,
  signal?: AbortSignal
): Promise<string> {
  try {
    const root = await resolveRepositoryRoot(cwd);
    if (!root) {
      reportWarning('Repo map skipped: workspace root is unsafe or unavailable', undefined, { notify });
      return '';
    }
    progress?.({
      phase: 'collecting',
      current: 0,
      total: 0,
      message: 'Discovering files...',
    });

    const files = await collectFiles(root, {
      maxFiles: config.maxFiles,
      excludedDirs: config.excludedDirs,
      onProgress: (count) => {
        progress?.({
          phase: 'collecting',
          current: count,
          total: count,
          message: `${count} files found`,
        });
      },
      signal,
    });

    if (signal?.aborted) {
      return '';
    }

    progress?.({
      phase: 'collecting',
      current: files.length,
      total: files.length,
      message: `${files.length} files discovered`,
    });

    if (files.length === 0) {
      progress?.({ phase: 'done', current: 1, total: 1, message: 'No files found' });
      return '';
    }

    progress?.({ phase: 'init', current: 0, total: 1, message: 'Loading language parsers...' });

    await initTreeSitter(notify);

    if (signal?.aborted) {
      return '';
    }

    const parseResults = new Map<string, ParseResult>();
    const fileParseFailures: { filePath: string; error: unknown }[] = [];

    progress?.({
      phase: 'parsing',
      current: 0,
      total: files.length,
      message: 'Parsing files...',
    });

    const REPORT_INTERVAL = 10;
    let lastReportIndex = 0;

    for (let i = 0; i < files.length; i++) {
      if (signal?.aborted) {
        return '';
      }

      const file = files[i];
      try {
        const content = await readSafeRegularFile(root, file.path);
        const cached = getCachedParse(content);
        if (cached) {
          parseResults.set(file.path, cached);
        } else {
          const result = await parseFile(file.path, content, notify);
          setCachedParse(content, result);
          parseResults.set(file.path, result);
        }
      } catch (err) {
        fileParseFailures.push({ filePath: file.path, error: err });
      }

      if ((i - lastReportIndex >= REPORT_INTERVAL) || i === files.length - 1) {
        progress?.({
          phase: 'parsing',
          current: i + 1,
          total: files.length,
          message: `Parsed ${i + 1}/${files.length} files`,
        });
        lastReportIndex = i;
      }
    }

    if (fileParseFailures.length > 0) {
      const firstFailure = fileParseFailures[0];
      reportWarning('Failed to parse some files; repo map may be incomplete', firstFailure.error, {
        context: {
          failedFiles: fileParseFailures.length,
          firstFile: firstFailure.filePath,
        },
        notify,
      });
    }

    progress?.({
      phase: 'graphing',
      current: 0,
      total: 1,
      message: 'Analyzing dependencies...',
    });

    const rankedFiles = processGraph(files, parseResults);

    if (signal?.aborted) {
      return '';
    }

    progress?.({ phase: 'rendering', current: 0, total: 1, message: 'Generating repo map...' });

    const tokenBudget = Number.isInteger(config.tokenBudget)
      ? Math.min(MAX_TOKEN_BUDGET, Math.max(MIN_TOKEN_BUDGET, config.tokenBudget))
      : MIN_TOKEN_BUDGET;
    const result = renderRepoMap(rankedFiles, parseResults, tokenBudget);

    progress?.({
      phase: 'done',
      current: 1,
      total: 1,
      message: `${files.length} files, ${parseResults.size} parsed`,
    });

    return result;
  } catch (err) {
    reportError('Repo-map generation failed', err, {
      context: { workspace: 'current workspace' },
      notify,
    });
    progress?.({ phase: 'done', current: 0, total: 0, message: 'Failed' });
    return '';
  }
}
