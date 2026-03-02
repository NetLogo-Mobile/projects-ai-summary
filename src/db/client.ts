import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

let db: Database | null = null;
const dbPath = config.databasePath;

// 初始化数据库
export async function initDatabase(): Promise<void> {
  if (db) return;

  const SQL = await initSqlJs();

  if (fs.existsSync(dbPath)) {
    const data = fs.readFileSync(dbPath);
    db = new SQL.Database(data);
  } else {
    db = new SQL.Database();
  }
}

// 确保数据库已初始化
function getDb(): Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

// 保存数据库到文件
export function saveDatabase(): void {
  if (db) {
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    const data = db.export();
    fs.writeFileSync(dbPath, data);
  }
}

export function run(sql: string, params: unknown[] = []): Promise<void> {
  return Promise.resolve().then(() => {
    const database = getDb();
    database.run(sql, params as any);
    saveDatabase();
  });
}

export function all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return Promise.resolve().then(() => {
    const database = getDb();
    const stmt = database.prepare(sql);
    stmt.bind(params as any);
    const results: T[] = [];

    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push(row as T);
    }

    stmt.free();
    return results;
  });
}
