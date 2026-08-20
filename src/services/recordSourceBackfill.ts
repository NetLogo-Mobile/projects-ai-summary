import { all } from '../db/client';
import { updateRecordSources } from '../db/repository';
import { createUserWithCredentials } from '../pl/client';
import { DataRecord } from '../types/data';
import {
  classifyHistoricalRecordSources,
  RECORD_SOURCE_QUERIES,
} from './recordSource';

type ProjectQueryUser = {
  projects: {
    query: (type: string, query: Record<string, unknown>) => Promise<any>;
  };
};

const PAGE_SIZE = 100;

async function queryAllIds(user: ProjectQueryUser, type: string, tag: string): Promise<Set<string>> {
  const ids = new Set<string>();

  for (let skip = 0; ; skip += PAGE_SIZE) {
    const response = await user.projects.query(type, {
      tags: [tag],
      take: -PAGE_SIZE,
      skip,
    });
    const items = response?.Data?.$values;
    if (!Array.isArray(items)) {
      throw new Error(`来源查询返回结构异常: type=${type}, tag=${tag}, skip=${skip}`);
    }
    const pageIds = items.map((item: any) => String(item.ID ?? '').trim()).filter(Boolean);

    if (pageIds.length === 0) break;
    const previousSize = ids.size;
    pageIds.forEach((id: string) => ids.add(id));

    console.log(`[backfill-sources] 查询来源: type=${type}, tag=${tag}, skip=${skip}, count=${pageIds.length}`);
    if (pageIds.length < PAGE_SIZE || ids.size === previousSize) break;
  }

  return ids;
}

export async function backfillHistoricalRecordSources(
  username: string,
  password: string,
): Promise<Record<string, number>> {
  const rows = await all<Pick<DataRecord, 'id'>>(
    `SELECT id FROM data WHERE source IS NULL OR TRIM(source) = ''`,
  );
  if (rows.length === 0) {
    console.log('[backfill-sources] 没有待回填的历史记录');
    return {};
  }

  const user = (await createUserWithCredentials(username, password)) as ProjectQueryUser;
  const sourceIds = new Map<string, ReadonlySet<string>>();

  // Complete every remote query before writing any classification.
  for (const query of RECORD_SOURCE_QUERIES) {
    sourceIds.set(query.source, await queryAllIds(user, query.type, query.tag));
  }

  const classifications = classifyHistoricalRecordSources(
    rows.map((row) => row.id),
    sourceIds,
  );
  await updateRecordSources(classifications);

  const counts: Record<string, number> = {};
  for (const source of classifications.values()) {
    counts[source] = (counts[source] ?? 0) + 1;
  }
  return counts;
}
