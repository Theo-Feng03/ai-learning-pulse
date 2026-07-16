export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function parseTopics(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === "string") : [];
  } catch {
    return [];
  }
}

export const RUN_STATUS_LABELS: Record<string, string> = {
  created: "已创建",
  fetching: "抓取中",
  normalizing: "标准化中",
  analyzing: "AI 分析中",
  completed: "成功",
  partial_failed: "部分失败",
  failed: "失败",
  failed_stale: "超时中断",
};

export const AI_STATUS_LABELS: Record<string, string> = {
  pending: "待分析",
  not_configured: "no_ai",
  analyzed: "已分析",
  analyze_failed: "分析失败",
  rate_limited: "限流跳过",
  queued: "排队中",
  skipped: "已跳过",
};

export const ENTRY_STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  confirmed: "已确认",
  published: "已发布",
  archived: "已归档",
};

export const SOURCE_STATUS_LABELS: Record<string, string> = {
  active: "正常",
  degraded: "异常",
  disabled: "停用",
};
