// Based on workflow-extension (ISC License)
// Copyright (c) 2026 popododo0720

import { type ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { loadConfig, type RepoMapConfig } from './src/config';
import { type NotifyFn, reportError } from './src/errorReporter';
import { generateRepoMap } from './src/generator';
import { resolveRepositoryRoot } from './src/security';
import {
  type ProgressCallback,
  type SetProgressWidget,
  createWidgetProgressCallback,
  clearProgressWidget,
} from './src/progress';
import { injectRepoMap } from './src/renderer';

interface CachedRepoMap {
  cwd: string;
  map: string;
  timestamp: number;
}

let cache: CachedRepoMap | null = null;

async function buildRepoMap(
  cwd: string,
  config: RepoMapConfig,
  notify?: NotifyFn,
  progress?: ProgressCallback,
  signal?: AbortSignal
): Promise<string> {
  const repoMap = await generateRepoMap(cwd, config, notify, progress, signal);
  cache = { cwd, map: repoMap, timestamp: Date.now() };
  return repoMap;
}


export default function (pi: ExtensionAPI) {
  // Inject repo map into system prompt
  pi.on("before_agent_start", async (event, ctx) => {
    try {
      // Check if disabled via flag
      if (pi.getFlag("no-repo-map")) {
        return;
      }

      const root = await resolveRepositoryRoot(ctx.cwd);
      if (!root) {
        ctx.hasUI && ctx.ui.notify('Repo map skipped: workspace root is unsafe or unavailable', 'warning');
        return;
      }

      const config = await loadConfig(root);
      if (config.enabled === false) {
        return;
      }

      // Check cache
      if (cache && cache.cwd === root) {
        return {
          systemPrompt: event.systemPrompt + injectRepoMap(cache.map),
        };
      }

      // Check for abort signal
      if (ctx.signal?.aborted) {
        return;
      }

      const notify: NotifyFn | undefined = ctx.hasUI
        ? ctx.ui.notify.bind(ctx.ui)
        : undefined;

      // Set up progress widget if UI is available
      const setWidget: SetProgressWidget | undefined = ctx.hasUI
        ? ctx.ui.setWidget.bind(ctx.ui)
        : undefined;
      const progressCallback: ProgressCallback | undefined = setWidget
        ? createWidgetProgressCallback(setWidget)
        : undefined;

      // Generate fresh repo map with progress reporting
      const repoMap = await buildRepoMap(root, config, notify, progressCallback, ctx.signal);

      // Clear progress widget
      if (setWidget) {
        clearProgressWidget(setWidget);
      }

      return {
        systemPrompt: event.systemPrompt + injectRepoMap(repoMap),
      };
    } catch (err) {
      const notify: NotifyFn | undefined = ctx.hasUI
        ? ctx.ui.notify.bind(ctx.ui)
        : undefined;
      reportError('Repo-map hook failed', err, {
        context: { workspace: 'current workspace' },
        notify,
      });
      // Clear progress widget on error
      if (ctx.hasUI) {
        const setWidget: SetProgressWidget = ctx.ui.setWidget.bind(ctx.ui);
        clearProgressWidget(setWidget);
      }
      return;
    }
  });

  pi.registerCommand("repo-map", {
    description: "Print the current repo map",
    handler: async (_args, ctx) => {
      const root = await resolveRepositoryRoot(ctx.cwd);
      if (!root) {
        ctx.ui.notify('Repo map skipped: workspace root is unsafe or unavailable', 'warning');
        return;
      }
      const config = await loadConfig(root);
      if (config.enabled === false) {
        ctx.ui.notify('Repo map is disabled for this project', 'info');
        return;
      }

      const repoMap = await buildRepoMap(
        root,
        config,
        ctx.hasUI ? ctx.ui.notify.bind(ctx.ui) : undefined,
        undefined,
        ctx.signal
      );

      ctx.ui.notify(repoMap || '(empty repo map)', 'info');
    },
  });

  // Optional: flag to disable
  pi.registerFlag("no-repo-map", {
    description: "Disable automatic repo map injection",
    type: "boolean",
    default: false,
  });
}
