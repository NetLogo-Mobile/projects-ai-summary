import { createUser } from '../pl/client';
import { analyzeContent } from './spark';
import { insertOne, queryById } from '../db/repository';
import { DataRecord } from '../types/data';

// 并发控制器：限制最多并发 N 个操作
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrencyLimit: number
): Promise<T[]> {
  const results: T[] = [];
  const executing: Promise<T>[] = [];

  for (const [index, task] of tasks.entries()) {
    const promise = task().then((result) => {
      results[index] = result;
      return result;
    });

    executing.push(promise);

    if (executing.length >= concurrencyLimit) {
      await Promise.race(executing);
      executing.splice(
        executing.findIndex((p) => p === promise),
        1
      );
    }
  }

  await Promise.all(executing);
  return results;
}

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
  const list = await user.projects.query('Discussion', { tags: [tag], take: -100, skip: 0});
  let skipped = 0;
  const insertTasks: (() => Promise<void>)[] = [];

  for (const item of list.Data.$values ?? []) {
    // 检查ID是否已经被检查过处理过，如果已处理则跳过API请求
    const exist = await queryById(item.ID);
    if (exist.length > 0) {
      console.log(`[collectByTag] ID已检查过，跳过: ${item.ID}`);
      skipped += 1;
      continue;
    }

    const summary = await user.projects.getSummary(item.ID, 'Discussion');
    const text = summary.Data.Description.join('');
    if (!text.trim()) {
      console.log(`[collectByTag] 内容为空，跳过: ${item.ID}`);
      skipped += 1;
      continue;
    }

    console.log(`[collectByTag] 开始分析ID: ${item.ID}`);
    try {
      const llm = await analyzeContent(text);
      const record = toRecord(item, summary, llm);
      console.log('[DB] 准备写入:', record.id);
      
      // 添加插入任务到队列
      insertTasks.push(async () => {
        await insertOne(record);
        console.log('[DB] 成功写入:', record.id);
      });
    } catch (error) {
      console.error(`[collectByTag] API分析失败，跳过ID: ${item.ID}`, error instanceof Error ? error.message : String(error));
      skipped += 1;
    }

    await new Promise((r) => setTimeout(r, 1500));
  }

  // 并发执行插入操作，限制并发数为10
  console.log(`[collectByTag] 开始并发插入 ${insertTasks.length} 条记录...`);
  const results = await runWithConcurrency(insertTasks, 10);
  const inserted = results.length;

  return { inserted, skipped };
}

export async function backfillByDiscussionIds(ids: string[]): Promise<{ inserted: number; skipped: number }> {
  const user = await createUser();
  let skipped = 0;
  const insertTasks: (() => Promise<void>)[] = [];

  for (const id of ids) {
    // 检查ID是否已经被检查过，如果已处理则跳过，不再发请求到API
    const exist = await queryById(id);
    if (exist.length > 0) {
      console.log(`[backfillByDiscussionIds] ID已检查过，跳过API请求: ${id}`);
      skipped += 1;
      continue;
    }

    console.log(`[backfillByDiscussionIds] 开始处理ID: ${id}`);
    const summary = await user.projects.getSummary(id, 'Discussion');
    const text = summary.Data.Description.join('');
    if (!text.trim()) {
      console.log(`[backfillByDiscussionIds] 内容为空，跳过: ${id}`);
      skipped += 1;
      continue;
    }

    console.log(`[backfillByDiscussionIds] 开始分析ID: ${id}`);
    try {
      const llm = await analyzeContent(text);
      const record = {
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
      };
      console.log('[DB] 准备写入记录:', {
        id: record.id,
        name: record.name,
        author: record.userName,
        year: record.year
      });

      // 添加插入任务到队列
      insertTasks.push(async () => {
        await insertOne(record);
        console.log('[DB] 成功写入记录:', record.id);
      });
    } catch (error) {
      console.error(`[backfillByDiscussionIds] API分析失败，跳过ID: ${id}`, error instanceof Error ? error.message : String(error));
      skipped += 1;
    }

    await new Promise((r) => setTimeout(r, 1500));
  }

  // 并发执行插入操作，限制并发数为10
  console.log(`[backfillByDiscussionIds] 开始并发插入 ${insertTasks.length} 条记录...`);
  const results = await runWithConcurrency(insertTasks, 10);
  const inserted = results.length;

  return { inserted, skipped };
}
