import axios from 'axios';
import { config } from '../config';
import { LLMResult } from '../types/data';

const systemPrompt =
  `你是结构化学术分类助手。正在执行结构化信息提取任务。必须且只能输出无格式纯文本的JSON对象，确保JSON.parse可直接解析。
  <forbid>绝对禁止任何非JSON内容，包括：1)自然语言说明 2)代码块标记 3)特殊符号。</forbid>
  格式死亡红线：①缺失字段立即报错 ②数值未加引号视为格式错误 ③数组元素必须双引号包裹。示范正确格式：
  {"summary":"...","Subject1":["工学"],"Subject2":["机械设计及理论"],"keywords":["流体力学"],"readability":0.72}`;

export async function analyzeContent(text: string): Promise<LLMResult> {
  // 参数验证：检查text不能为空
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('[Spark] 参数验证失败：text 参数不能为空');
  }

  try {
    console.log(`[Spark] 发送请求 - 模型: ${config.sparkModel}, 文本长度: ${text.length}`);
    
    const response = await axios.post(
      config.sparkEndpoint,
      {
        model: config.sparkModel,
        temperature: 0.2,
        tools: [
          {
            type: 'function',
            function: {
              name: 'json_output',
              description: '返回结构化的JSON格式数据',
              parameters: {
                type: 'object',
                properties: {
                  summary: {
                    type: 'string',
                    description: '作品摘要'
                  },
                  Subject1: {
                    type: 'array',
                    items: { type: 'string' },
                    description: '学科门类，从以下学科选择:哲学，经济学，法学，教育学，文学，历史学，理学，工学，农学，医学，军事学，管理学，艺术学'
                  },
                  Subject2: {
                    type: 'array',
                    items: { type: 'string' },
                    description: '一级学科分类'
                  },
                  keywords: {
                    type: 'array',
                    items: { type: 'string' },
                    description: '关键词列表，10-20个'
                  },
                  readability: {
                    type: 'number',
                    minimum: 0,
                    maximum: 1,
                    description: '可读性评分，0.00到1.00之间的小数，[科普=0.3, 学报=0.6, 顶会=0.9]'
                  }
                },
                required: ['summary', 'Subject1', 'Subject2', 'keywords', 'readability']
              }
            }
          }
        ],
        tool_choice: 'auto',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content:
              '请分析下列作品并使用json_output工具返回结构化数据:' + text
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

    console.log('[Spark] 响应成功');
    
    // 优先从工具调用获取JSON数据，否则从content获取
    let parsed = null;
    const toolCalls = response.data?.choices?.[0]?.message?.tool_calls;
    
    if (toolCalls && toolCalls.length > 0) {
      // 解析工具调用的参数
      const toolCall = toolCalls[0];
      const toolArgs = typeof toolCall.function.arguments === 'string' 
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments;
      parsed = toolArgs;
      console.log('[Spark] 从工具调用获取数据');
    } else {
      // 回退到从content获取
      const raw =
        response.data?.choices?.[0]?.message?.content ?? response.data?.data?.choices?.text ?? '';

      // 移除 markdown 代码块包裹 (```json ... ```)
      const cleaned = String(raw)
        .trim()
        .replace(/^```(?:json)?\n?/, '')
        .replace(/\n?```$/, '')
        .trim();

      parsed = JSON.parse(cleaned);
      console.log('[Spark] 从content内容获取数据');
    }

    // 验证必需字段不为空
    if (!parsed.summary || typeof parsed.summary !== 'string' || parsed.summary.trim().length === 0) {
      throw new Error('[Spark] 参数验证失败：summary 不能为空');
    }
    if (!Array.isArray(parsed.Subject1) || parsed.Subject1.length === 0) {
      throw new Error('[Spark] 参数验证失败：Subject1 不能为空');
    }
    if (!Array.isArray(parsed.Subject2) || parsed.Subject2.length === 0) {
      throw new Error('[Spark] 参数验证失败：Subject2 不能为空');
    }
    if (!Array.isArray(parsed.keywords) || parsed.keywords.length === 0) {
      throw new Error('[Spark] 参数验证失败：keywords 不能为空');
    }
    if (typeof parsed.readability !== 'number' || parsed.readability < 0 || parsed.readability > 1) {
      throw new Error('[Spark] 参数验证失败：readability 必须是0-1之间的数字');
    }

    return {
      summary: parsed.summary,
      Subject1: parsed.Subject1,
      Subject2: parsed.Subject2,
      keywords: parsed.keywords,
      readability: Number(parsed.readability)
    };
  } catch (error: any) {
    console.error('[Spark] 错误 - 状态码:', error.response?.status);
    console.error('[Spark] 错误信息:', error.response?.statusText);
    console.error('[Spark] 响应数据:', JSON.stringify(error.response?.data, null, 2));
    throw error;
  }
}
