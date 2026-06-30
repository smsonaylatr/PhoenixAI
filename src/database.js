import Database from 'better-sqlite3';

export const db = new Database('phoenix-ai.db');
db.pragma('journal_mode = WAL');

export function migrate() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    telegram_id TEXT PRIMARY KEY,
    name TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS journal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT,
    user_text TEXT,
    ai_reply TEXT,
    mode TEXT DEFAULT 'coach',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT,
    task TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    done_at TEXT
  );

  CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT,
    memory TEXT,
    importance INTEGER DEFAULT 50,
    category TEXT DEFAULT 'general',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS agent_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT,
    note TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    telegram_id TEXT,
    key TEXT,
    value TEXT,
    PRIMARY KEY (telegram_id, key)
  );
  `);
}
