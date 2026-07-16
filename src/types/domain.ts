// 领域常量与类型：SQLite 无枚举，这里是状态字段的唯一取值来源

export const SOURCE_TYPES = ["RSS", "ATOM", "GITHUB_RELEASE"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const SOURCE_STATUSES = ["active", "degraded", "disabled"] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];

export const RUN_STATUSES = [
  "created",
  "fetching",
  "normalizing",
  "analyzing",
  "completed",
  "partial_failed",
  "failed",
  "failed_stale",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const ARTICLE_STATUSES = [
  "fetched",
  "normalized",
  "analyzed",
  "analyze_failed",
  "ignored",
  "saved",
] as const;
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];

export const AI_STATUSES = [
  "pending",
  "not_configured",
  "analyzed",
  "analyze_failed",
  "rate_limited",
  "queued",
  "skipped",
] as const;
export type AiStatus = (typeof AI_STATUSES)[number];

export const ENTRY_STATUSES = ["draft", "confirmed", "published", "archived"] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];

export const AI_CATEGORIES = [
  "Model",
  "Product",
  "DeveloperTool",
  "Research",
  "Industry",
  "Community",
  "Other",
] as const;
export type AiCategory = (typeof AI_CATEGORIES)[number];

// AI 只能从该列表中选择主题；用户手工选择主题时同样以 Topic 表为准
export const ALLOWED_TOPICS = [
  "AI Search",
  "Agent Infrastructure",
  "Model Evaluation",
  "Model Release",
  "Developer Tools",
  "Multimodal",
  "Inference & Serving",
  "Open Source Models",
  "AI Product",
  "AI Safety",
  "Research",
  "Other",
] as const;

export const SHOWCASE_SCHEMA_VERSION = 1;
// v2：分析输出新增 titleZh（中文标题）
export const PROMPT_VERSION = "v2";

// 有效学习记录：userTakeaway 去除空白后的最小长度
export const MIN_TAKEAWAY_LENGTH = 10;
