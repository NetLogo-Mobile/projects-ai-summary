import { createBot } from '../pl/client';
import { config } from '../config';
import { SearchFilters, searchRecords } from '../db/repository';

function parseNumber(value: string): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseQuery(content: string): SearchFilters | null {
  const msg = content.trim();

  // 1) 键值查询: #查询 关键词=电磁学,光学 作者=张三 年份=2024 难度=0.2-0.7 学科=理学 limit=8
  if (msg.startsWith('#查询')) {
    const payload = msg.replace(/^#查询\s*/, '');
    const chunks = payload.split(/\s+/).map((x) => x.trim()).filter(Boolean);
    const filters: SearchFilters = {};

    for (const chunk of chunks) {
      const [rawKey, ...rest] = chunk.split(/[=:：]/);
      const rawValue = rest.join(':').trim();
      const key = rawKey.trim();
      if (!rawValue) continue;

      if (key === '关键词' || key === 'kw') {
        filters.keywords = rawValue.split(/[，,|]/).map((x) => x.trim()).filter(Boolean);
      } else if (key === '作者') {
        filters.author = rawValue;
      } else if (key === '年份') {
        filters.year = parseNumber(rawValue);
      } else if (key === '年份范围') {
        const [from, to] = rawValue.split('-').map((v) => parseNumber(v.trim()));
        filters.yearFrom = from;
        filters.yearTo = to;
      } else if (key === '难度') {
        if (rawValue.includes('-')) {
          const [minR, maxR] = rawValue.split('-').map((v) => parseNumber(v.trim()));
          filters.minReadability = minR;
          filters.maxReadability = maxR;
        } else {
          const val = parseNumber(rawValue);
          if (typeof val === 'number') {
            filters.minReadability = val;
            filters.maxReadability = val;
          }
        }
      } else if (key === '学科') {
        filters.discipline = rawValue;
      } else if (key === 'limit') {
        filters.limit = parseNumber(rawValue);
      }
    }

    return filters;
  }

  // 2) 兼容老格式: #查词: 电磁学,光学
  const keywordMatch = msg.match(/^#查词[:：](.+)$/);
  if (keywordMatch) {
    return {
      keywords: keywordMatch[1]
        .split(/[，,\s]+/)
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 6),
      limit: 10
    };
  }

  // 3) 新增快捷格式
  const authorMatch = msg.match(/^#查作者[:：](.+)$/);
  if (authorMatch) return { author: authorMatch[1].trim(), limit: 10 };

  const yearMatch = msg.match(/^#查年份[:：](\d{4})(?:-(\d{4}))?$/);
  if (yearMatch) {
    if (yearMatch[2]) {
      return {
        yearFrom: Number(yearMatch[1]),
        yearTo: Number(yearMatch[2]),
        limit: 10
      };
    }
    return { year: Number(yearMatch[1]), limit: 10 };
  }

  const levelMatch = msg.match(/^#查难度[:：](\d(?:\.\d+)?)-(\d(?:\.\d+)?)$/);
  if (levelMatch) {
    return {
      minReadability: Number(levelMatch[1]),
      maxReadability: Number(levelMatch[2]),
      limit: 10
    };
  }

  const disciplineMatch = msg.match(/^#查学科[:：](.+)$/);
  if (disciplineMatch) return { discipline: disciplineMatch[1].trim(), limit: 10 };

  return null;
}

function helpMessage(): string {
  return [
    '支持多种查询格式：',
    '1) #查词: 电磁学,光学',
    '2) #查作者: 用户名',
    '3) #查年份: 2024 或 #查年份: 2021-2024',
    '4) #查难度: 0.2-0.6',
    '5) #查学科: 理学',
    '6) #查询 关键词=电磁学,光学 作者=张三 年份范围=2021-2024 难度=0.2-0.8 学科=理学 limit=8'
  ].join('\n');
}

export async function runDiscussionBot(): Promise<void> {
  const bot = createBot(async (msg: { Content: string }) => {
    const filters = parseQuery(msg.Content);
    if (!filters) return helpMessage();

    const rows = await searchRecords(filters);
    if (rows.length === 0) {
      return '未命中记录，请缩小条件或更换关键词。\n' + helpMessage();
    }

    const lines = rows.map(
      (x) => `<discussion=${x.id}>${x.name}</discussion> | ${x.userName} | ${x.year} | 难度:${x.readability.toFixed(2)}`
    );

    return `<size=28>${lines.join('\n')}</size>`;
  });

  await bot.auth.login();
  await bot.init(config.discussionId, 'Discussion', {
    replyRequired: false,
    readHistory: false
  });

  bot.start(20);
}
