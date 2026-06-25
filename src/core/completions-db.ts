/**
 * SQLite-backed completion history with frecency sorting.
 * Context: command / prod / smoke / docker-dbuild / fleet-bundle / recipe.
 */
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

function stateDir(): string {
  const base = process.env.XDG_STATE_HOME || `${homedir()}/.local/state`;
  const dir = `${base}/l10n`;
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

let _db: Database | null = null;

function db(): Database {
  if (_db) return _db;
  _db = new Database(join(stateDir(), "completions.db"));
  _db.run(
    `CREATE TABLE IF NOT EXISTS completions (
      context   TEXT NOT NULL,
      value     TEXT NOT NULL,
      count     INTEGER NOT NULL DEFAULT 1,
      last_used INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (context, value)
    )`,
  );
  _db.run("PRAGMA journal_mode=WAL");
  return _db;
}

export function logCompletion(context: string, value: string): void {
  const d = db();
  d.run(
    `INSERT INTO completions (context, value, count, last_used)
     VALUES (?, ?, 1, unixepoch())
     ON CONFLICT(context, value) DO UPDATE SET
       count = count + 1,
       last_used = unixepoch()`,
    [context, value],
  );
}

export function listCompletions(context: string, defaults: string[]): string[] {
  if (defaults.length === 0) return [];

  const d = db();
  const rows = d
    .query<{ value: string; count: number }, [string]>(
      `SELECT value, count FROM completions
       WHERE context = ?
       ORDER BY count DESC, last_used DESC`,
    )
    .all(context) as { value: string; count: number }[];

  const freq = new Map(rows.map((r) => [r.value, r.count]));
  const scored = defaults.map((v) => ({ value: v, count: freq.get(v) ?? 0 }));
  scored.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  return scored.map((s) => s.value);
}
