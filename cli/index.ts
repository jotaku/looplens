#!/usr/bin/env node
import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { installPlugin, uninstallPlugin } from './install.js';

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

const VERSION = '0.1.0';
const command = process.argv[2] ?? 'start';

function printHelp() {
  console.log(`
  LoopLens v${VERSION} — Analytics dashboard for Claude Code

  Usage:
    looplens [command]

  Commands:
    start       Start the dashboard server (default)
    install     Install Claude Code hooks & statusline plugin
    uninstall   Remove Claude Code hooks & statusline plugin
    help        Show this help message

  Examples:
    npx looplens            # Start the dashboard
    looplens install        # Set up Claude Code integration
    looplens uninstall      # Remove Claude Code integration
`);
}

async function main() {
  switch (command) {
    case 'start': {
      const root = findPackageRoot();
      // Set env so the server can find the frontend build
      process.env.LOOPLENS_ROOT = root;
      // Import the server — it auto-starts on import
      await import('../server/index.js');
      break;
    }

    case 'install': {
      const result = installPlugin();
      if (result.installed) {
        console.log('');
        console.log('  ✓ LoopLens plugin installed successfully');
        console.log('');
        console.log(`  ${result.message.split('\n').join('\n  ')}`);
        console.log('');
        console.log('  Next: run `looplens` to start the dashboard.');
        console.log('');
      } else {
        console.error(`  ✗ ${result.message}`);
        process.exit(1);
      }
      break;
    }

    case 'uninstall': {
      const result = uninstallPlugin();
      if (result.removed) {
        console.log('');
        console.log('  ✓ LoopLens plugin removed');
        console.log(`  ${result.message.split('\n').join('\n  ')}`);
        console.log('');
      } else {
        console.error(`  ✗ ${result.message}`);
        process.exit(1);
      }
      break;
    }

    case 'help':
    case '--help':
    case '-h':
      printHelp();
      break;

    case 'version':
    case '--version':
    case '-v':
      console.log(VERSION);
      break;

    default:
      console.error(`  Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
