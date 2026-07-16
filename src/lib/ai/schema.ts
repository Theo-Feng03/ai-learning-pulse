import { z } from "zod";
import { AI_CATEGORIES } from "@/types/domain";
import type { ArticleAnalysisOutput } from "./types";

export const analysisOutputSchema = z.object({
  relevanceScore: z.number().int().min(0).max(100),
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
  let text = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/m.exec(text);
  if (fenced) text = fenced[1];

  const parsed: unknown = JSON.parse(text);
  const result = analysisOutputSchema.parse(parsed);

  const allowed = new Set(allowedTopics);
  const topics = [...new Set(result.topics.map((t) => (allowed.has(t) ? t : "Other")))];
  return { ...result, topics: topics.length > 0 ? topics : ["Other"] };
}
