type LogLevel = 'warn' | 'error';

type NotifyType = 'info' | 'warning' | 'error';

export type NotifyFn = (message: string, type?: NotifyType) => void;

type ContextValue = string | number | boolean | null | undefined;

interface ReportOptions {
  context?: Record<string, ContextValue>;
  onceKey?: string;
  notify?: NotifyFn;
}

const reportedKeys = new Set<string>();

function stringifyUnknown(value: unknown): string {
  return 'unknown error';
}

function formatContext(context?: Record<string, ContextValue>): string {
  if (!context) return '';

  const entries = Object.entries(context).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return '';

  return entries
    .map(([key, value]) => `${key}=${typeof value === 'string' ? '<redacted>' : String(value)}`)
    .join(' ');
}

function writeLog(level: LogLevel, message: string, details?: string): void {
  const suffix = details ? ` | ${details}` : '';
  console.error(`[repo-map] ${level.toUpperCase()}: ${message}${suffix}`);
}

function shouldSkip(onceKey?: string): boolean {
  if (!onceKey) return false;
  if (reportedKeys.has(onceKey)) return true;

  reportedKeys.add(onceKey);
  return false;
}

function toNotifyType(level: LogLevel): NotifyType {
  return level === 'warn' ? 'warning' : 'error';
}

function toNotifyMessage(message: string, details?: string): string {
  return details ? `${message} (${details})` : message;
}

function report(level: LogLevel, message: string, error?: unknown, options?: ReportOptions): void {
  if (shouldSkip(options?.onceKey)) {
    return;
  }

  const parts: string[] = [];
  const contextText = formatContext(options?.context);
  if (contextText) {
    parts.push(contextText);
  }

  if (error !== undefined) {
    parts.push(`error=${stringifyUnknown(error)}`);
  }

  const details = parts.join(' | ');
  if (options?.notify) {
    options.notify(toNotifyMessage(message, details), toNotifyType(level));
    return;
  }

  writeLog(level, message, details);
}

export function errorSignature(error: unknown): string {
  if (error instanceof Error) {
    return error.name;
  }

  return stringifyUnknown(error);
}

export function reportWarning(message: string, error?: unknown, options?: ReportOptions): void {
  report('warn', message, error, options);
}

export function reportError(message: string, error?: unknown, options?: ReportOptions): void {
  report('error', message, error, options);
}
