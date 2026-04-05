import axios from "axios";
import { config } from "../config";

export interface QueryExpansionResult {
  extraKeywords: string[];
  reason?: string;
}

const GENERIC_KEYWORDS = new Set([
  "学术",
  "研究",
  "论文",
  "科学",
  "技术",
  "理论",
  "实验",
  "方法",
  "分析",
  "模型",
  "study",
  "research",
  "paper",
  "science",
  "technology",
  "method",
  "analysis",
  "model",
]);

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
}

function safeJsonParse(content: string): QueryExpansionResult | null {
  try {
    const parsed = JSON.parse(content) as QueryExpansionResult;
    if (!parsed || !Array.isArray(parsed.extraKeywords)) return null;
    return {
      extraKeywords: uniq(parsed.extraKeywords).slice(0, 5),
      reason:
        typeof parsed.reason === "string" ? parsed.reason.trim() : undefined,
    };
  } catch {
    return null;
  }
}

interface GroqChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  error?: {
    message?: string;
  };
}

function getGroqChatCompletionsUrl(): string | null {
  if (!config.groqApiKey) return null;
  return `${config.groqBaseUrl.replace(/\/+$/, "")}/chat/completions`;
}

function getGroqErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const apiMessage =
      typeof error.response?.data?.error?.message === "string"
        ? error.response.data.error.message.trim()
        : undefined;
    if (status && apiMessage) return `${status} ${apiMessage}`;
    if (status) return `${status} ${error.message}`;
  }

  return error instanceof Error ? error.message : String(error);
}

// function extractHanChars(value: string): string[] {
//   return Array.from(value).filter(char => /[\u4E00-\u9FFF]/u.test(char));
// }

function isSafeExpandedKeyword(
  candidate: string,
  input: string,
  originalKeywords: string[],
): boolean {
  const normalized = candidate.trim();
  if (!normalized) return false;
  if (GENERIC_KEYWORDS.has(normalized.toLowerCase())) return false;

  // const originalText = `${input} ${originalKeywords.join(' ')}`;
  // const originalHan = new Set(extractHanChars(originalText));
  // const candidateHan = Array.from(new Set(extractHanChars(normalized)));

  // if (candidateHan.length > 0 && originalHan.size > 0) {
  //   const overlapCount = candidateHan.filter(char => originalHan.has(char)).length;
  //   if (overlapCount >= 1) {
  //       return true;
  //   } else {
  //       return true;
  //   }
  // }

  return true;
}

export async function expandKeywordsWithGroq(
  input: string,
  originalKeywords: string[],
): Promise<QueryExpansionResult> {
  const url = getGroqChatCompletionsUrl();
  if (!url) return { extraKeywords: [] };

  const prompt = `你是专业的学术与搜索查询词优化引擎。请输出 JSON，格式为 {"extraKeywords": string[], "reason": string}。
你的核心任务是给出最多5个高价值的额外关键词，必须遵循以下处理优先级：
1. 拼写与格式纠正：修复大小写、缺失的空格、错误的标点
2. 错别字与俗称纠正：识别用户的错别字或俗称，转换为学术标准名称（如 阿式园 -> 阿氏圆, 阿波罗尼斯圆）。
3. 缩写与全称互转：(如 NLP -> 自然语言处理, Natural Language Processing)。
4. 自然语言提取：如果输入是长句，提取核心名词。

硬约束：
- 不要改变原始查询的核心意图。
- 仅保留简短的关键词，避免长句。
- 如果没有合适的扩展，extraKeywords 返回空数组。

【示例】
输入: "Physicslab"
输出: {"extraKeywords": ["Physics Lab", "Physics Laboratory", "PhysicsLab"], "reason": "补充缺失的空格并扩展全称"}

输入: "P.E."
输出: {"extraKeywords": ["PE", "Physical Education", "体育"], "reason": "清理多余标点并扩展全称"}

输入: "帮我找一下圆曲线的相关内容" 
输出: {"extraKeywords": ["圆锥曲线", "椭圆", "双曲线", "抛物线" ], "reason": "圆曲线是错误拼写，用户想表达的是圆锥曲线，他又可以细分"}

输入: "阿式园"
输出: {"extraKeywords": ["阿氏圆", "阿波罗尼斯圆", "Apollonian circles"], "reason": "纠正错别字并提供数学学术名词"}`;

  try {
    const resp = await axios.post<GroqChatCompletionResponse>(
      url,
      {
        model: config.groqModel,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "只输出 JSON，不要输出 markdown。extraKeywords 仅保留短词，避免长句。",
          },
          { role: "user", content: prompt },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${config.groqApiKey}`,
          "Content-Type": "application/json",
          "User-Agent": "pl-s-2-groq-intent/1.0",
        },
        timeout: 15000,
      },
    );

    const content = resp.data.choices?.[0]?.message?.content ?? "";
    const parsed = safeJsonParse(content);
    if (!parsed) {
      console.warn("[Groq] 关键词扩展返回了非预期 JSON，将使用原查询。");
      return { extraKeywords: [] };
    }

    const deduped = uniq(
      parsed.extraKeywords.filter((candidate) => {
        if (!isSafeExpandedKeyword(candidate, input, originalKeywords))
          return false;
        return !originalKeywords.some(
          (origin) => origin.toLowerCase() === candidate.toLowerCase(),
        );
      }),
    ).slice(0, 10);
    console.log("[Groq] 获取关键词扩展结果:", deduped, parsed.reason ?? "");
    return { extraKeywords: deduped, reason: parsed.reason };
  } catch (error) {
    console.warn(
      "[Groq] 关键词扩展失败，将使用原查询:",
      getGroqErrorMessage(error),
    );
    return { extraKeywords: [] };
  }
}
