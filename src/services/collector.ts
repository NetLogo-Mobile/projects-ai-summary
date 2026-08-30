import { createUser } from '../pl/client';
import { analyzeContent, analyzeContentWithModel } from './analyse';
import { insertOne, queryById } from '../db/repository';
import { config } from '../config';
import { DataRecord } from '../types/data';
import { resolveRecordSource } from './recordSource';
import { getCollectionSkipReason } from './collectionFilter';

// 并发控制器：限制最多并发 N 个操作
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrencyLimit: number
): Promise<T[]> {
  if (tasks.length === 0) return [];

  const limit = Math.max(1, Math.floor(concurrencyLimit));
  const results = new Array<T>(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < tasks.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await tasks[index]();
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, tasks.length) },
    () => worker()
  );

  await Promise.all(workers);
  return results;
}

function toRecord(
  project: any,
  summary: any,
  llm: any,
  taggingModel: string,
  source: string,
): DataRecord {
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
    readability: llm.readability,
    taggingModel,
    source,
  };
}

/**
 * 按内容类型收集作品，来源和过滤标签均来自作品详情
 * 支持自动分页获取超过API单次限制的数据
 * @param discussionType - 内容类型（Experiment 或 Discussion）
 * @param skip - 跳过的记录数，默认为0
 * @param model - AI模型名称，如果未提供则使用配置中的默认模型
 * @param take - 获取的记录数，负数表示绕过API限制的数量（-100获取100条，-300分3次各100条）
 *              默认为-100（获取最近100条）
 * @returns 收集结果统计
 */
export async function collectByTypeWithOptions(
  discussionType: string,
  skip: number = 0, 
  model?: string,
  take: number = -100
): Promise<{ inserted: number; skipped: number }> {
  const user = await createUser();
  const resolvedModel = model ?? config.model;
  console.log(
    `[collectByTypeWithOptions] 参数: 类型=${discussionType}, pageSize=${config.collectPageSize}, batchSize=${config.collectBatchSize}, analyzeConcurrency=${config.collectAnalyzeConcurrency}, insertConcurrency=${config.collectInsertConcurrency}, pageDelayMs=${config.collectPageDelayMs}, batchDelayMs=${config.collectBatchDelayMs}`
  );
  
  // 自动分页获取数据（plweb API需要用负数绕过单次返回限制）
  let allItems: any[] = [];
  const takeAbsolute = Math.abs(take);
  const singlePageSize = config.collectPageSize;
  
  let currentSkip = skip;
  let remaining = takeAbsolute;
  
  while (remaining > 0) {
    const currentTake = Math.min(remaining, singlePageSize);
    // 使用负数来绕过API限制
    const takeValue = -currentTake;
    console.log(`[collectByTypeWithOptions] 分页获取: skip=${currentSkip}, take=${takeValue}`);
    
    let list;
    try {
      list = await user.projects.query(discussionType, { take: takeValue, skip: currentSkip });
    } catch (error) {
      console.error(`[collectByTypeWithOptions] 分页获取失败，跳过: skip=${currentSkip}, take=${takeValue}`, error instanceof Error ? error.message : String(error));
      // 如果是第一次尝试就失败，或者已经是最后一批，则跳出循环
      if (currentSkip === skip || remaining <= singlePageSize) {
        break;
      }
      // 否则继续下一批
      currentSkip += singlePageSize;
      continue;
    }
    
    const items = list.Data.$values ?? [];
    
    if (items.length === 0) {
      console.log(`[collectByTypeWithOptions] 已到数据末尾`);
      break;
    }
    
    allItems = allItems.concat(items);
    remaining -= items.length;
    currentSkip += currentTake;
    
    // 分页间延迟，避免频繁请求
    if (remaining > 0 && config.collectPageDelayMs > 0) {
      await new Promise((r) => setTimeout(r, config.collectPageDelayMs));
    }
  }
  
  let inserted = 0;
  let skipped = 0;
  
  const items = allItems;
  const batchSize = config.collectBatchSize;

  // 分批处理作品，批大小由配置控制
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    console.log(`[collectByTypeWithOptions] 开始处理第 ${batchNum} 批 (共${Math.ceil(items.length / batchSize)}批)`);
    
    // 当前批的待分析数据
    const sourcesToAnalyze: Array<{ item: any; summary: any; text: string }> = [];
    let batchSkipped = 0;

    for (const item of batch) {
      // 检查ID是否已经被检查过处理过，如果已处理则跳过API请求
      const exist = await queryById(item.ID);
      if (exist.length > 0) {
        console.log(`[collectByTypeWithOptions] ID已检查过，跳过: ${item.ID}`);
        batchSkipped += 1;
        continue;
      }

      let summary;
      try {
        summary = await user.projects.getSummary(item.ID, discussionType);
      } catch (error) {
        console.error(`[collectByTypeWithOptions] 获取摘要失败，跳过ID: ${item.ID}`, error instanceof Error ? error.message : String(error));
        batchSkipped += 1;
        continue;
      }

      const summaryData = summary.Data ?? {};
      const skipReason = getCollectionSkipReason(summaryData);
      if (skipReason) {
        console.log(`[collectByTypeWithOptions] 过滤作品: ${item.ID}，${skipReason}`);
        batchSkipped += 1;
        continue;
      }
      
      const text = Array.isArray(summaryData.Description)
        ? summaryData.Description.join('')
        : String(summaryData.Description ?? '');
      if (!text.trim()) {
        console.log(`[collectByTypeWithOptions] 内容为空，跳过: ${item.ID}`);
        batchSkipped += 1;
        continue;
      }

      sourcesToAnalyze.push({ item, summary, text });
    }

    // 并发调用API分析（当前批）
    if (sourcesToAnalyze.length > 0) {
      console.log(`[collectByTypeWithOptions] 第 ${batchNum} 批: 开始并发分析 ${sourcesToAnalyze.length} 条记录...`);
      const analyzeTasks = sourcesToAnalyze.map(({ item, summary, text }) => async () => {
        console.log(`[collectByTypeWithOptions] 分析ID: ${item.ID}`);
        try {
          // 根据是否提供了model参数选择调用方式
          const llm = model 
            ? await analyzeContentWithModel(text, model)
            : await analyzeContent(text);
          return { item, summary, llm, error: null };
        } catch (error) {
          console.error(`[collectByTypeWithOptions] API分析失败，跳过ID: ${item.ID}`, error instanceof Error ? error.message : String(error));
          return { item, summary, llm: null, error };
        }
      });

      const analyzeResults = await runWithConcurrency(analyzeTasks, config.collectAnalyzeConcurrency);

      // 累积插入任务（当前批）
      const insertTasks: (() => Promise<void>)[] = [];
      for (const result of analyzeResults) {
        if (result.error || !result.llm) {
          batchSkipped += 1;
          continue;
        }
        
        const summaryData = result.summary.Data ?? {};
        const source = resolveRecordSource(
          discussionType,
          summaryData.Tags ?? summaryData.Tag,
        );
        const record = toRecord(result.item, result.summary, result.llm, resolvedModel, source);
        insertTasks.push(async () => {
          await insertOne(record);
          console.log('[DB] 成功写入:', record.id);
        });
      }

      // 并发执行数据库插入（当前批）
      if (insertTasks.length > 0) {
        console.log(`[collectByTypeWithOptions] 第 ${batchNum} 批: 开始并发插入 ${insertTasks.length} 条记录...`);
        const insertResults = await runWithConcurrency(insertTasks, config.collectInsertConcurrency);
        inserted += insertResults.length;
      }
    }

    skipped += batchSkipped;
    
    // 批次间延迟，避免频繁请求
    if (i + batchSize < items.length && config.collectBatchDelayMs > 0) {
      await new Promise((r) => setTimeout(r, config.collectBatchDelayMs));
    }
  }

  console.log(`[collectByTypeWithOptions] 完成! 插入: ${inserted}, 跳过: ${skipped}`);
  return { inserted, skipped };
}
