import { createUser } from '../pl/client';
import { analyzeContent } from './spark';
import { insertOne, queryById } from '../db/repository';
import { DataRecord } from '../types/data';

function toRecord(project: any, summary: any, llm: any): DataRecord {
  return {
    id: project.ID,
    name: project.Subject,
    contentLength: summary.Data.Description.join('').length,
    userID: summary.Data.User?.ID ?? '',
    userName: summary.Data.User?.Nickname ?? '',
    editorID: summary.Data.Editor?.ID ?? '',
    editorName: summary.Data.Editor?.Nickname ?? '',
    year: new Date(summary.Data.CreationDate).getFullYear(),
    summary: llm.summary,
    primaryDiscipline: JSON.stringify(llm.Subject1),
    secondaryDiscipline: JSON.stringify(llm.Subject2),
    keyWords: JSON.stringify(llm.keywords),
    readability: llm.readability
  };
}

export async function collectByTag(tag: string): Promise<{ inserted: number; skipped: number }> {
  const user = await createUser();
  const list = await user.projects.query('Discussion', { tags: [tag], take: -100, skip: 0 });
  let inserted = 0;
  let skipped = 0;

  for (const item of list.Data.$values ?? []) {
    const exist = await queryById(item.ID);
    if (exist.length > 0) {
      skipped += 1;
      continue;
    }

    const summary = await user.projects.getSummary(item.ID, 'Discussion');
    const text = summary.Data.Description.join('');
    if (!text.trim()) {
      skipped += 1;
      continue;
    }

    const llm = await analyzeContent(text);
    await insertOne(toRecord(item, summary, llm));
    inserted += 1;

    await new Promise((r) => setTimeout(r, 1500));
  }

  return { inserted, skipped };
}

export async function backfillByDiscussionIds(ids: string[]): Promise<{ inserted: number; skipped: number }> {
  const user = await createUser();
  let inserted = 0;
  let skipped = 0;

  for (const id of ids) {
    const exist = await queryById(id);
    if (exist.length > 0) {
      skipped += 1;
      continue;
    }

    const summary = await user.projects.getSummary(id, 'Discussion');
    const text = summary.Data.Description.join('');
    if (!text.trim()) {
      skipped += 1;
      continue;
    }

    const llm = await analyzeContent(text);
    await insertOne({
      id,
      name: summary.Data.Subject ?? id,
      contentLength: text.length,
      userID: summary.Data.User?.ID ?? '',
      userName: summary.Data.User?.Nickname ?? '',
      editorID: summary.Data.Editor?.ID ?? '',
      editorName: summary.Data.Editor?.Nickname ?? '',
      year: new Date(summary.Data.CreationDate).getFullYear(),
      summary: llm.summary,
      primaryDiscipline: JSON.stringify(llm.Subject1),
      secondaryDiscipline: JSON.stringify(llm.Subject2),
      keyWords: JSON.stringify(llm.keywords),
      readability: llm.readability
    });
    inserted += 1;

    await new Promise((r) => setTimeout(r, 1500));
  }

  return { inserted, skipped };
}
