import axios from 'axios';
import { config } from '../config';
import { LLMResult } from '../types/data';

const systemPrompt =
  '你是结构化学术分类助手。返回 JSON，字段必须包含 summary, Subject1, Subject2, keywords, readability。readability取0到1之间的小数。';

export async function analyzeContent(text: string): Promise<LLMResult> {
  const response = await axios.post(
    config.sparkEndpoint,
    {
      model: config.sparkModel,
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content:
            '请分析下列作品并仅返回JSON（不要markdown，不要代码块）:' + text
        }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${config.sparkApiPassword}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    }
  );

  const raw =
    response.data?.choices?.[0]?.message?.content ?? response.data?.data?.choices?.text ?? '';

  const parsed = JSON.parse(String(raw).trim());
  return {
    summary: parsed.summary ?? '',
    Subject1: Array.isArray(parsed.Subject1) ? parsed.Subject1 : [],
    Subject2: Array.isArray(parsed.Subject2) ? parsed.Subject2 : [],
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
    readability: Number(parsed.readability ?? 0.5)
  };
}
