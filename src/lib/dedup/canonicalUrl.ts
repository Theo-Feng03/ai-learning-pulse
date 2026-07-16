// canonical URL 规则（Vibe Coding PRD 10.3）：
// hostname 小写、删 fragment、删跟踪参数、删默认端口、非根路径去末尾斜杠、query 按键排序

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "ref",
  "ref_src",
  "gclid",
  "fbclid",
  "mc_cid",
  "mc_eid",
]);

export function canonicalizeUrl(rawUrl: string): string {
  const url = new URL(rawUrl.trim());

  url.hostname = url.hostname.toLowerCase();
  url.hash = "";

  if (
    (url.protocol === "http:" && url.port === "80") ||
    (url.protocol === "https:" && url.port === "443")
  ) {
    url.port = "";
  }

  const kept: Array<[string, string]> = [];
  for (const [key, value] of url.searchParams.entries()) {
    if (!TRACKING_PARAMS.has(key.toLowerCase())) kept.push([key, value]);
  }
  kept.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  url.search = "";
  for (const [key, value] of kept) url.searchParams.append(key, value);

  if (url.pathname !== "/" && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }

  return url.toString();
}

/** 信源 URL 归一化：用于 type + normalizedUrl 唯一约束 */
export function normalizeSourceUrl(rawUrl: string, type: string): string {
  const canonical = canonicalizeUrl(rawUrl);
  return `${type}:${canonical.toLowerCase()}`;
}
