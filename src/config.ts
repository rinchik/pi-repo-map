// Based on workflow-extension (ISC License)
// Copyright (c) 2026 popododo0720

export interface RepoMapConfig {
  enabled: boolean;
  tokenBudget: number;
  maxFiles: number;
  excludedDirs: string[];
}

export const DEFAULT_EXCLUDED_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '__pycache__',
  '.venv',
  'venv',
  'vendor',
  '.pi',
  '.cache',
  'coverage',
  '.turbo',
  'target',
  'bin',
  'obj',
  '.idea',
  '.vscode',
];

export const MIN_TOKEN_BUDGET = 256;
export const MAX_TOKEN_BUDGET = 8192;
export const MIN_MAX_FILES = 1;
export const MAX_MAX_FILES = 2000;
const MAX_EXCLUDED_DIRS = 128;
const DEFAULT_CONFIG: RepoMapConfig = {
  enabled: true,
  tokenBudget: 2048,
  maxFiles: 500,
  excludedDirs: DEFAULT_EXCLUDED_DIRS,
};

function validInteger(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= min && value <= max;
}

function validExcludedDir(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 &&
    value !== '.' && value !== '..' && !/[\\/\x00-\x1f\x7f]/.test(value);
}

export async function loadConfig(root: string): Promise<RepoMapConfig> {
  const configPath = `${root}/.pi/repo-map.json`;

  try {
    const { readSafeRegularFile } = await import('./security');
    const content = await readSafeRegularFile(root, configPath);
    const userConfig: unknown = JSON.parse(content);
    if (!userConfig || typeof userConfig !== 'object' || Array.isArray(userConfig)) return DEFAULT_CONFIG;
    const input = userConfig as Record<string, unknown>;
    const custom = Array.isArray(input.excludedDirs) ? input.excludedDirs.filter(validExcludedDir).slice(0, MAX_EXCLUDED_DIRS) : [];
    const excludedDirs = [...DEFAULT_EXCLUDED_DIRS, ...custom].filter((value, index, all) =>
      all.findIndex(candidate => candidate.toLowerCase() === value.toLowerCase()) === index
    );
    return {
      enabled: typeof input.enabled === 'boolean' ? input.enabled : DEFAULT_CONFIG.enabled,
      tokenBudget: validInteger(input.tokenBudget, MIN_TOKEN_BUDGET, MAX_TOKEN_BUDGET) ? input.tokenBudget : DEFAULT_CONFIG.tokenBudget,
      maxFiles: validInteger(input.maxFiles, MIN_MAX_FILES, MAX_MAX_FILES) ? input.maxFiles : DEFAULT_CONFIG.maxFiles,
      excludedDirs,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}
