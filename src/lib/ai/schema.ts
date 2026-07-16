import { z } from "zod";
import { AI_CATEGORIES } from "@/types/domain";
import type { ArticleAnalysisOutput, TranslationOutput } from "./types";

/** 容忍 ```json 代码块包裹的 JSON 解析 */
export function parseJsonBlock(raw: string): unknown {
  let text = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/m.exec(text);
  if (fenced) text = fenced[1];
  return JSON.parse(text);
}

export const analysisOutputSchema = z.object({
  relevanceScore: z.number().int().min(0).max(100),
  // 中文标题：原文非中文时的忠实翻译；模型可省略（如原文已是中文）
  titleZh: z.string().max(500).optional(),
  category: z.enum(AI_CATEGORIES),
  topics: z.array(z.string().min(1)).max(5),
  summaryZh: z.string().min(1).max(2000),
  whyItMatters: z.string().max(2000),
  confidence: z.number().min(0).max(1),
  insufficientContent: z.boolean(),
});

/**
 * 解析模型返回的 JSON 文本并校验。
 * 容忍 ```json 代码块包裹；topics 会被裁剪到 allowedTopics 内（不合法主题归入 Other）。
 */
export function parseAnalysisOutput(
  raw: string,
  allowedTopics: string[],
): ArticleAnalysisOutput {
  const result = analysisOutputSchema.parse(parseJsonBlock(raw));

  const allowed = new Set(allowedTopics);
  const topics = [...new Set(result.topics.map((t) => (allowed.has(t) ? t : "Other")))];
  return { ...result, topics: topics.length > 0 ? topics : ["Other"] };
}

export const translationOutputSchema = z.object({
  title: z.string().min(1).max(1000),
  excerpt: z.string().max(8000),
});

export function parseTranslationOutput(raw: string): TranslationOutput {
  return translationOutputSchema.parse(parseJsonBlock(raw));
}
