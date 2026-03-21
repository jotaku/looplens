import { existsSync, mkdirSync, cpSync, readFileSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dir = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));

/** Walk up from current file to find the package root (where package.json lives). */
function findPackageRoot(): string {
  let dir = __dir;
  for (let i = 0; i < 5; i++) {
    if (existsSync(resolve(dir, 'package.json'))) return dir;
    dir = resolve(dir, '..');
  }
  return process.cwd();
}

const CLAUDE_DIR = join(homedir(), '.claude');
const PLUGIN_DEST = join(CLAUDE_DIR, 'plugins', 'looplens');
const SETTINGS_PATH = join(CLAUDE_DIR, 'settings.json');
const PLUGIN_SRC = resolve(process.env.LOOPLENS_ROOT ?? findPackageRoot(), 'plugin');

export function installPlugin(): { installed: boolean; message: string } {
  try {
    // Ensure ~/.claude/plugins/ exists
    mkdirSync(join(CLAUDE_DIR, 'plugins'), { recursive: true });

    // Copy plugin files
    if (existsSync(PLUGIN_DEST)) {
      rmSync(PLUGIN_DEST, { recursive: true, force: true });
    }
    cpSync(PLUGIN_SRC, PLUGIN_DEST, { recursive: true });

    // Make scripts executable
    const statuslinePath = join(PLUGIN_DEST, 'scripts', 'statusline.sh');
    if (existsSync(statuslinePath)) chmodSync(statuslinePath, 0o755);
    const hookRelayPath = join(PLUGIN_DEST, 'scripts', 'hook-relay.sh');
    if (existsSync(hookRelayPath)) chmodSync(hookRelayPath, 0o755);

    // Update ~/.claude/settings.json to add statusline
    let settings: Record<string, unknown> = {};
    if (existsSync(SETTINGS_PATH)) {
      try {
        settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
      } catch {
        settings = {};
      }
    }

    // Add statusline config
    settings.statusLine = {
      type: 'command',
      command: join(PLUGIN_DEST, 'scripts', 'statusline.sh'),
    };

    // Add hooks from the plugin's hooks.json into settings
    const hooksJsonPath = join(PLUGIN_DEST, 'hooks', 'hooks.json');
    if (existsSync(hooksJsonPath)) {
      try {
        const pluginHooks = JSON.parse(readFileSync(hooksJsonPath, 'utf-8'));
        const existingHooks = (settings.hooks as Record<string, unknown[]>) ?? {};

        for (const [event, hookConfigs] of Object.entries(pluginHooks)) {
          if (!existingHooks[event]) {
            existingHooks[event] = [];
          }
          // Avoid duplicates: check if our URL is already registered
          const configs = hookConfigs as Array<{ hooks: Array<{ url?: string }> }>;
          for (const config of configs) {
            const alreadyExists = (existingHooks[event] as Array<{ hooks: Array<{ url?: string }> }>)
              .some(existing => existing.hooks?.some(h => h.url === config.hooks?.[0]?.url));
            if (!alreadyExists) {
              (existingHooks[event] as unknown[]).push(config);
            }
          }
        }

        settings.hooks = existingHooks;
      } catch {
        // Hooks installation failed, continue anyway
      }
    }

    writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');

    return {
      installed: true,
      message: `Plugin installed to ${PLUGIN_DEST}\nStatusline configured in ${SETTINGS_PATH}\nHooks registered for: SessionStart, PostToolUse, Stop, StopFailure, SessionEnd`,
    };
  } catch (err) {
    return {
      installed: false,
      message: `Installation failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export function uninstallPlugin(): { removed: boolean; message: string } {
  try {
    // Remove plugin directory
    if (existsSync(PLUGIN_DEST)) {
      rmSync(PLUGIN_DEST, { recursive: true, force: true });
    }

    // Remove statusline and hooks from settings
    if (existsSync(SETTINGS_PATH)) {
      try {
        const settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));

        // Remove statusline if it points to our plugin
        if (settings.statusLine?.command?.includes('looplens')) {
          delete settings.statusLine;
        }

        // Remove our hooks (identified by localhost:4244 URL)
        if (settings.hooks) {
          for (const event of Object.keys(settings.hooks)) {
            settings.hooks[event] = (settings.hooks[event] as unknown[]).filter((config: any) => {
              return !config.hooks?.some((h: any) => h.url?.includes('localhost:4244'));
            });
            if (settings.hooks[event].length === 0) {
              delete settings.hooks[event];
            }
          }
          if (Object.keys(settings.hooks).length === 0) {
            delete settings.hooks;
          }
        }

        writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
      } catch {
        // Settings cleanup failed, continue
      }
    }

    return {
      removed: true,
      message: `Plugin removed from ${PLUGIN_DEST}\nHooks and statusline removed from settings`,
    };
  } catch (err) {
    return {
      removed: false,
      message: `Uninstall failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
