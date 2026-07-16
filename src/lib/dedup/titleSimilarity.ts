// 规则型标题相似度（Vibe Coding PRD 10.3）：
// Unicode 规范化 → 小写 → 去标点/站点后缀/多余空格 → token Jaccard

// 常见站点后缀，例如 "Foo Bar | TechCrunch" / "Foo Bar - The Verge"
const SITE_SUFFIX_PATTERN = /\s+[|\-–—·]\s+[^|\-–—·]{2,40}$/;

export function normalizeTitle(title: string): string {
  let t = title.normalize("NFKC").toLowerCase().trim();
  t = t.replace(SITE_SUFFIX_PATTERN, "");
  // 去标点（保留字母数字、CJK 与空白）
  t = t.replace(/[^\p{L}\p{N}\s]/gu, " ");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

function tokenize(normalized: string): Set<string> {
  const tokens = new Set<string>();
  for (const part of normalized.split(" ")) {
    if (!part) continue;
    // CJK 无空格分词：按双字符切分；拉丁词直接作为 token
    if (/[㐀-鿿]/.test(part)) {
      for (let i = 0; i < part.length; i++) {
        tokens.add(part.slice(i, i + 2));
      }
    } else {
      tokens.add(part);
    }
  }
  return tokens;
}

/** token Jaccard 相似度，范围 0-1 */
export function titleSimilarity(a: string, b: string): number {
  const ta = tokenize(normalizeTitle(a));
  const tb = tokenize(normalizeTitle(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersection = 0;
  for (const token of ta) if (tb.has(token)) intersection++;
  const union = ta.size + tb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
