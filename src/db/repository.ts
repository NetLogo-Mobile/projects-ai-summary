import { all, run } from './client';
import { DataRecord } from '../types/data';

export interface SearchFilters {
  keywords?: string[];
  author?: string;
  year?: number;
  yearFrom?: number;
  yearTo?: number;
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
              '(name LIKE ? OR keyWords LIKE ? OR primaryDiscipline LIKE ? OR secondaryDiscipline LIKE ? OR userName LIKE ? OR summary LIKE ?)'
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

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(Math.max(filters.limit ?? 10, 1), 20);

  params.push(limit);

  // 如果有关键词，需要计算匹配优先级（summary 优先级最低）
  // 使用 CASE 语句计算匹配分数：name > keyWords > discipline > userName > summary
  const selectClause = filters.keywords && filters.keywords.length > 0
    ? `*, CASE 
        WHEN name LIKE ? THEN 1
        WHEN keyWords LIKE ? THEN 2
        WHEN primaryDiscipline LIKE ? OR secondaryDiscipline LIKE ? THEN 3
        WHEN userName LIKE ? THEN 4
        WHEN summary LIKE ? THEN 5
        ELSE 6
      END AS matchPriority`
    : '*';

  let query = `SELECT ${selectClause} FROM data ${whereClause}`;

  if (filters.keywords && filters.keywords.length > 0) {
    const firstKeyword = `%${filters.keywords[0]}%`;
    params.pop(); // 移除 limit
    params.push(firstKeyword, firstKeyword, firstKeyword, firstKeyword, firstKeyword, firstKeyword);
    query += ` ORDER BY matchPriority ASC, year DESC, readability ASC LIMIT ?`;
    params.push(limit);
  } else {
    query += ` ORDER BY year DESC, readability ASC LIMIT ?`;
  }

  return all<DataRecord>(query, params);
}
