import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { getDb, closeDb } from '../db.js';

let tmpDir: string;

export function setupTestDb(): void {
  tmpDir = mkdtempSync(join(tmpdir(), 'cca-test-'));
  const dbPath = join(tmpDir, 'test.db');
  getDb(dbPath);
}

export function teardownTestDb(): void {
  closeDb();
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch { /* ignore cleanup errors */ }
}
