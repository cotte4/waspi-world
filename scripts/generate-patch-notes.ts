/**
 * generate-patch-notes.ts
 * Runs at build time. Reads git log, groups commits by date,
 * writes the last 30 days to public/patch-notes.json.
 *
 * Usage: tsx scripts/generate-patch-notes.ts
 */

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import path from 'path';

interface PatchEntry {
  date: string;   // ISO date string: "YYYY-MM-DD"
  commits: string[];
}

function run() {
  let log: string;
  try {
    log = execSync('git log --format="%ad|%s" --date=short', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    console.warn('[patch-notes] git log failed — writing empty patch notes.');
    writeFileSync(
      path.join(process.cwd(), 'public', 'patch-notes.json'),
      JSON.stringify([]),
    );
    return;
  }

  const grouped = new Map<string, string[]>();

  for (const line of log.trim().split('\n')) {
    if (!line.trim()) continue;
    const pipeIdx = line.indexOf('|');
    if (pipeIdx === -1) continue;
    const date = line.slice(0, pipeIdx).trim();
    const msg  = line.slice(pipeIdx + 1).trim();
    if (!date || !msg) continue;

    // Skip chore/ci/test commits to keep patch notes user-friendly
    if (/^(chore|ci|test|lint|refactor)(\(.*\))?:/i.test(msg)) continue;

    if (!grouped.has(date)) grouped.set(date, []);
    grouped.get(date)!.push(msg);
  }

  // Sort by date descending, keep max 30 entries
  const entries: PatchEntry[] = Array.from(grouped.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 30)
    .map(([date, commits]) => ({ date, commits }));

  const outPath = path.join(process.cwd(), 'public', 'patch-notes.json');
  writeFileSync(outPath, JSON.stringify(entries, null, 2));
  console.log(`[patch-notes] Generated ${entries.length} entries → public/patch-notes.json`);
}

run();
