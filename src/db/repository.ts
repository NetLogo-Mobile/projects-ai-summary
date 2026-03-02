import { all, run } from './client';
import { DataRecord } from '../types/data';

export interface SearchFilters {
  keywords?: string[];
  author?: string;
  year?: number;
  yearFrom?: number;
  yearTo?: number;
  minReadability?: number;
  maxReadability?: number;
  discipline?: string;
  limit?: number;
}

export async function initTable(): Promise<void> {
  await run(`
    CREATE TABLE IF NOT EXISTS data (
      id TEXT PRIMARY KEY,
      name TEXT,
      contentLength INTEGER,
      userID TEXT,
      userName TEXT,
      editorID TEXT,
      editorName TEXT,
      year INTEGER,
      summary TEXT,
      primaryDiscipline TEXT,
      secondaryDiscipline TEXT,
      keyWords TEXT,
      readability REAL
    );
  `);
}

export async function queryById(id: string): Promise<DataRecord[]> {
  return all<DataRecord>('SELECT * FROM data WHERE id = ?', [id]);
}

export async function insertOne(data: DataRecord): Promise<void> {
  await run(
    `INSERT INTO data (
      id, name, contentLength, userID, userName, editorID, editorName,
      year, summary, primaryDiscipline, secondaryDiscipline, keyWords, readability
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.id,
      data.name,
      data.contentLength,
      data.userID,
      data.userName,
      data.editorID,
      data.editorName,
      data.year,
      data.summary,
      data.primaryDiscipline,
      data.secondaryDiscipline,
      data.keyWords,
      data.readability
    ]
  );
}

export async function searchRecords(filters: SearchFilters): Promise<DataRecord[]> {
  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (filters.keywords && filters.keywords.length > 0) {
    conditions.push(
      '(' +
        filters.keywords
          .map(
            () =>
              '(name LIKE ? OR summary LIKE ? OR keyWords LIKE ? OR primaryDiscipline LIKE ? OR secondaryDiscipline LIKE ? OR userName LIKE ?)'
          )
          .join(' OR ') +
        ')'
    );

    for (const key of filters.keywords) {
      const wildcard = `%${key}%`;
      params.push(wildcard, wildcard, wildcard, wildcard, wildcard, wildcard);
    }
  }

  if (filters.author) {
    conditions.push('(userName LIKE ? OR editorName LIKE ?)');
    const wildcard = `%${filters.author}%`;
    params.push(wildcard, wildcard);
  }

  if (typeof filters.year === 'number') {
    conditions.push('year = ?');
    params.push(filters.year);
  }

  if (typeof filters.yearFrom === 'number') {
    conditions.push('year >= ?');
    params.push(filters.yearFrom);
  }

  if (typeof filters.yearTo === 'number') {
    conditions.push('year <= ?');
    params.push(filters.yearTo);
  }

  if (typeof filters.minReadability === 'number') {
    conditions.push('readability >= ?');
    params.push(filters.minReadability);
  }

  if (typeof filters.maxReadability === 'number') {
    conditions.push('readability <= ?');
    params.push(filters.maxReadability);
  }

  if (filters.discipline) {
    conditions.push('(primaryDiscipline LIKE ? OR secondaryDiscipline LIKE ?)');
    const wildcard = `%${filters.discipline}%`;
    params.push(wildcard, wildcard);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(Math.max(filters.limit ?? 10, 1), 20);

  params.push(limit);

  return all<DataRecord>(
    `SELECT * FROM data ${whereClause} ORDER BY year DESC, readability ASC LIMIT ?`,
    params
  );
}
