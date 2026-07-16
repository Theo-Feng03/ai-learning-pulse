import type { ArticleAnalysisInput } from "./types";

export const SYSTEM_PROMPT = `你是基于来源证据工作的 AI 行业资讯分析助手，负责降低用户的首轮阅读成本，不负责替用户生成个人观点。

约束：
- 只能依据输入内容总结；产品名、模型名、版本号和数字不得自行补充。
- 正文不足时设置 insufficientContent = true，并降低 confidence。
- whyItMatters 使用"可能值得关注"的客观口吻，不得输出第一人称"我学到了什么"。
- topics 最多 5 个，只能来自给定的 allowedTopics 列表；无法归类时使用 "Other"。
- 摘要 summaryZh 使用中文。

只输出一个 JSON 对象，不要输出其他文本。格式：
{
  "relevanceScore": 0-100 的整数,
  "category": "Model|Product|DeveloperTool|Research|Industry|Community|Other",
  "topics": ["..."],
  "summaryZh": "中文摘要",
  "whyItMatters": "为什么可能值得关注",
  "confidence": 0-1 的小数,
  "insufficientContent": true 或 false
}`;

export function buildUserPrompt(input: ArticleAnalysisInput): string {
  return [
    `title: ${input.title}`,
    `sourceName: ${input.sourceName}`,
    `publishedAt: ${input.publishedAt ?? "unknown"}`,
    `originalLanguage: ${input.originalLanguage ?? "unknown"}`,
    `excerpt: ${input.excerpt ?? "(无)"}`,
    `content: ${input.content ?? "(无正文)"}`,
    `configuredInterests: ${input.configuredInterests.join(", ") || "(未配置)"}`,
    `allowedTopics: ${input.allowedTopics.join(", ")}`,
  ].join("\n");
}

export function buildTranslateSystemPrompt(targetLang: "zh" | "en"): string {
  const langName = targetLang === "zh" ? "简体中文" : "英文（English）";
  return `你是一名专业的科技内容翻译。把用户提供的文章标题和摘要忠实翻译为${langName}。

约束：
- 忠实原文，不增删信息，不加入评论。
- 产品名、模型名、公司名、版本号、代码标识符保留原文，不翻译。
- 摘要为空时输出空字符串。

只输出一个 JSON 对象，不要输出其他文本。格式：
{
  "title": "翻译后的标题",
  "excerpt": "翻译后的摘要"
}`;
}

export function buildTranslateUserPrompt(title: string, excerpt?: string): string {
  return JSON.stringify({ title, excerpt: excerpt ?? "" });
}

export function buildRepairPrompt(invalidOutput: string): string {
  return `你上一次的输出不是合法的 JSON 或不符合要求的字段格式。请把下面的内容修复为符合系统提示中格式要求的单个 JSON 对象，只输出 JSON：\n\n${invalidOutput.slice(0, 4000)}`;
}
