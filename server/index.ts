import express from 'express';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { ingestRouter } from './routes/ingest.js';
import { sessionsRouter } from './routes/sessions.js';
import { statsRouter } from './routes/stats.js';
import { commitsRouter } from './routes/commits.js';
import { clearAll, getSessions } from './store.js';
import { enrichSessionFromTranscript } from './transcript.js';
import { getDb, closeDb } from './db.js';

const PORT = parseInt(process.env.PORT ?? '4244', 10);
const HOST = process.env.HOST ?? 'localhost';

const app = express();
app.use(express.json({ limit: '1mb' }));

// CORS for dev (Vite at :3001 → API at :4244)
app.use('/api', (_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (_req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

// API routes
app.use('/api/ingest', ingestRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/stats', statsRouter);
app.use('/api/commits', commitsRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

// Reset endpoint
app.post('/api/reset', (_req, res) => {
  clearAll();
  res.json({ ok: true });
});

// Backfill endpoint — enrich all sessions from transcripts
app.post('/api/backfill', (_req, res) => {
  const sessions = getSessions();
  let enriched = 0;
  for (const id of Object.keys(sessions)) {
    try {
      enrichSessionFromTranscript(id);
      enriched++;
    } catch { /* skip */ }
  }
  res.json({ ok: true, processed: Object.keys(sessions).length, enriched });
});

// Serve built frontend in production
// LOOPLENS_ROOT is set by the CLI; fallback for dev mode (tsx from server/)
const packageRoot = process.env.LOOPLENS_ROOT ?? resolve(import.meta.dirname ?? __dirname, '..');
const distDir = resolve(packageRoot, 'dist');
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  // SPA fallback — exclude /api paths so they get proper 404s
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(join(distDir, 'index.html'));
  });
}

// Initialize SQLite database (creates schema + migrates JSON if needed)
getDb();

const server = app.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}`;
  const W = 43;
  const pad = (s: string) => s + ' '.repeat(Math.max(0, W - s.length));
  console.log('');
  console.log(`  ╔${'═'.repeat(W)}╗`);
  console.log(`  ║${pad('   LoopLens')}║`);
  console.log(`  ║${pad('   ' + url)}║`);
  console.log(`  ╚${'═'.repeat(W)}╝`);
  console.log('');
  console.log('  Waiting for data from Claude Code plugin...');
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});

// Graceful shutdown — close SQLite connection
function shutdown() {
  console.log('\n  Shutting down...');
  closeDb();
  server.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
