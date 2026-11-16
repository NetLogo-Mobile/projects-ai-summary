import { config } from '../config';

const AUTH_DEVICE_IDENTIFIER = '0d1a760b44023875d2123f2cfcb56dad';

interface AuthenticateResponse {
  Status: number;
  Message: string;
  Token: string;
  AuthCode: string;
}

export interface PlSession {
  token: string;
  authCode: string;
}

async function plPostOnce<T>(path: string, body: unknown, headers: Record<string, string>): Promise<T> {
  const resp = await fetch(`${config.plBaseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

  const data = (await resp.json()) as { Status: number; Message: string };
  if (data.Status !== 200) {
    throw new Error(`PL API ${path} 业务错误 Status=${data.Status} Message=${data.Message}`);
  }
  return data as T;
}

async function plPost<T>(path: string, body: unknown, session?: PlSession): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'Accept-Language': 'zh-CN',
    'x-API-Version': '2411',
  };
  if (session) {
    headers['x-API-Token'] = session.token;
    headers['x-API-AuthCode'] = session.authCode;
  }

  // Transient network failures (timeouts, DNS) are common on shared CI runners and
  // previously aborted the whole collect run. Retry once after a short backoff;
  // business-level errors (Status != 200) are not retried, since they are deterministic.
  try {
    return await plPostOnce<T>(path, body, headers);
  } catch (error) {
    if (!isRetriable(error)) throw error;
    console.warn(`[pl] ${path} 网络失败，2s 后重试一次:`, error instanceof Error ? error.message : String(error));
    await new Promise((r) => setTimeout(r, 2000));
    return plPostOnce<T>(path, body, headers);
  }
}

function isRetriable(error: unknown): boolean {
  if (error instanceof Error) {
    // AbortSignal.timeout rejects with a DOMException named "TimeoutError".
    if (error.name === 'TimeoutError' || error.name === 'AbortError') return true;
    const cause = (error as { cause?: { code?: string } }).cause;
    const code = cause?.code;
    if (code && ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT'].includes(code)) {
      return true;
    }
    return /fetch failed|network|socket hang up/i.test(error.message);
  }
  return false;
}

export async function login(username: string, password: string): Promise<PlSession> {
  const data = await plPost<AuthenticateResponse>('/Users/Authenticate', {
    Login: username,
    Password: password,
    Version: 2411,
    Device: {
      Identifier: AUTH_DEVICE_IDENTIFIER,
      Language: 'Chinese',
    },
  });
  if (!data.Token || !data.AuthCode) {
    throw new Error('PL API 登录成功但缺少 Token/AuthCode');
  }
  return { token: data.Token, authCode: data.AuthCode };
}

export interface QueryExperimentsItem {
  ID: string;
  Subject: string;
  [key: string]: unknown;
}

export interface QueryExperimentsResponse {
  Data: { $values: QueryExperimentsItem[] } | QueryExperimentsItem[];
}

export interface QueryPage {
  items: QueryExperimentsItem[];
}

/**
 * 查询作品列表。按新版社区 API 规则（见 plweb-skill docs/practical-api.md）：
 * Take 必须为正数（负数会被拒绝），Skip 固定 0，翻页用 From=上一页末条摘要 ID。
 */
export async function queryExperiments(
  session: PlSession,
  category: 'Experiment' | 'Discussion',
  from: string | null,
  take: number,
  excludeTags: string[] | null = null,
): Promise<QueryPage> {
  const data = await plPost<QueryExperimentsResponse>('/Contents/QueryExperiments', {
    Query: {
      Category: category,
      Languages: [],
      ExcludeLanguages: [],
      Tags: null,
      ExcludeTags: excludeTags,
      ModelTags: null,
      ModelID: null,
      ParentID: null,
      UserID: null,
      Special: null,
      From: from,
      Skip: 0,
      Take: take,
      Days: 0,
      Sort: 0,
      ShowAnnouncement: false,
    },
  }, session);

  const raw = data.Data;
  const items = Array.isArray(raw) ? raw : (raw && raw.$values) || [];
  return { items };
}

export interface SummaryData {
  ID: string;
  ContentID?: string;
  User?: { ID: string; Nickname: string };
  Editor?: { ID: string; Nickname: string };
  CreationDate?: string;
  Description?: string[] | string;
  Tags?: string[] | string;
  Tag?: string[] | string;
  [key: string]: unknown;
}

export interface GetSummaryResponse {
  Data: SummaryData;
}

export async function getSummary(
  session: PlSession,
  summaryId: string,
  category: 'Experiment' | 'Discussion',
): Promise<GetSummaryResponse> {
  return plPost<GetSummaryResponse>('/Contents/GetSummary', {
    ContentID: summaryId,
    Category: category,
  }, session);
}
