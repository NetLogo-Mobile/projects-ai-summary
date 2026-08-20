import { config } from '../config';
import { queryByIds } from '../db/repository';
import { createUserWithCredentials } from '../pl/client';
import { DataRecord } from '../types/data';
import {
  ConsecutiveApiFailureGuard,
  SyncStoppedAfterApiFailuresError,
} from './apiFailureGuard';
import { getTagSyncSkipReason } from './tagSyncFilter';

type PlUser = {
  token: string;
  authCode: string;
  projects: {
    query: (type: string, query: Record<string, unknown>) => Promise<any>;
    getSummary: (id: string, type: string) => Promise<any>;
  };
  experiment: {
    get: (id: string, type: string) => Promise<any>;
    update: (summary: Record<string, unknown>, workspace: unknown) => Promise<any>;
  };
};

function parseJsonArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((v) => String(v).trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function buildDisciplineTagMap(): Record<string, string[]> {
  // 只使用内置映射，移除用户自定义映射功能
  const builtin: Record<string, string[]> = {
    数学: ['数学'],
    物理学: ['物理学'],
    化学: ['化学'],
    生物学: ['生物学'],
    地理学: ['地理学'],
    天文学: ['天文学'],
    计算机科学: ['计算机科学'],
    医学: ['医学'],
    电气工程: ['电气工程'],
    历史学: ['历史学'],
    哲学: ['哲学'],
    文学: ['文学'],
    艺术学: ['艺术学']
  };

  return builtin;
}

function getTargetTags(record: DataRecord, map: Record<string, string[]>, whitelist: Set<string>): string[] {
  const disciplines = [...parseJsonArray(record.primaryDiscipline), ...parseJsonArray(record.secondaryDiscipline)];
  const tags = new Set<string>();

  for (const discipline of disciplines) {
    const candidates = map[discipline] ?? [];
    for (const tag of candidates) {
      if (whitelist.has(tag)) {
        tags.add(tag);
      }
    }
  }

  return Array.from(tags);
}

async function updateWorkTags(
  user: PlUser,
  apiFailureGuard: ConsecutiveApiFailureGuard,
  summaryID: string,
  category: string,
  summaryData: Record<string, unknown>,
  nextTags: string[]
): Promise<any> {
  const experiment = await apiFailureGuard.call(
    `获取作品数据 ${summaryID}`,
    () => user.experiment.get(summaryID, category),
  );
  const workspace = experiment?.Data ?? experiment;

  return apiFailureGuard.call(
    `更新作品标签 ${summaryID}`,
    () => user.experiment.update(
      {
        ...summaryData,
        Tags: nextTags
      },
      workspace
    ),
    (response) => response?.Status === 200,
  );
}

export async function syncDisciplineTagsToSelectedWorks(
  skip: number = 0,
  apiFailureGuard: ConsecutiveApiFailureGuard = new ConsecutiveApiFailureGuard(),
): Promise<void> {
  if (!config.plAdminUsername || !config.plAdminPassword) {
    throw new Error('请配置 PL_ADMIN_USERNAME / PL_ADMIN_PASSWORD（或复用 PL_USERNAME / PL_PASSWORD）');
  }

  const user = (await apiFailureGuard.call(
    '登录标签同步账号',
    () => createUserWithCredentials(config.plAdminUsername, config.plAdminPassword),
  )) as PlUser;
  const category = config.syncCategory;

  const listed = await apiFailureGuard.call(
    `获取作品列表 skip=${skip}`,
    () => user.projects.query(category, {
      tags: [config.syncSourceTag],
      take: -100,
      skip
    }),
  );

  const items = listed?.Data?.$values ?? [];
  const ids = items.map((item: any) => item.ID).filter(Boolean);
  const records = await queryByIds(ids);
  const recordMap = new Map(records.map((record) => [record.id, record]));

  const disciplineTagMap = buildDisciplineTagMap();
  const whitelist = new Set(config.syncTagWhitelist);

  let updatedCount = 0;
  let skippedCount = 0;

  for (const item of items) {
    const summaryID = item.ID;
    const record = recordMap.get(summaryID);
    if (!record) {
      skippedCount += 1;
      continue;
    }

    let summary;
    try {
      summary = await apiFailureGuard.call(
        `获取作品摘要 ${summaryID}`,
        () => user.projects.getSummary(summaryID, category),
      );
    } catch (error) {
      if (error instanceof SyncStoppedAfterApiFailuresError) throw error;
      skippedCount += 1;
      continue;
    }
    const summaryData = summary?.Data;
    if (!summaryData) {
      console.warn(`[sync-tags] 获取作品摘要失败: ${summaryID}`);
      skippedCount += 1;
      continue;
    }

    const skipReason = getTagSyncSkipReason(summaryData);
    if (skipReason) {
      console.log(`[sync-tags] 过滤作品: ${summaryID}，${skipReason}`);
      skippedCount += 1;
      continue;
    }

    const currentTags: string[] = summaryData.Tags ?? [];
    const targetTags = getTargetTags(record, disciplineTagMap, whitelist);
    const missingTags = targetTags.filter((tag) => !currentTags.includes(tag));

    if (missingTags.length === 0) {
      skippedCount += 1;
      continue;
    }

    const nextTags = Array.from(new Set([...currentTags, ...missingTags]));
    try {
      await updateWorkTags(user, apiFailureGuard, summaryID, category, summaryData, nextTags);
    } catch (error) {
      if (error instanceof SyncStoppedAfterApiFailuresError) throw error;
      skippedCount += 1;
      continue;
    }

    console.log(`[sync-tags] 已更新标签: ${summaryID} -> ${missingTags.join(', ')}`);
    updatedCount += 1;
  }

  console.log(`[sync-tags] 完成。更新作品: ${updatedCount}，跳过: ${skippedCount}，候选总数: ${items.length}`);
}
