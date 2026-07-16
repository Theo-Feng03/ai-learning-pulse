import { ApiError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/client";
import { canonicalizeUrl } from "@/lib/dedup/canonicalUrl";
import { normalizeTitle } from "@/lib/dedup/titleSimilarity";
import { contentHashOf } from "@/lib/hash";
import { createDraftForArticle } from "./service";

// 手动学习记录：适用于无法自动采集的信息源（短视频、公众号、书、课程…）。
// 实现方式：创建真实 Article + MANUAL 类型的"虚拟信源"，
// 从而完整复用确认校验、published-only 统计和导出白名单，来源仍然可追溯。
// MANUAL 信源 enabled=false 且被采集管道显式排除，永不参与抓取。

export const MANUAL_SOURCE_TYPE = "MANUAL";

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKC")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "") || "manual"
  );
}

export interface ManualEntryInput {
  title: string;
  url: string;
  /** 来源名称，留空时使用 URL 域名 */
  sourceName?: string;
  /** 摘要/备注（可选），会作为文章摘要保存 */
  excerpt?: string;
  /** 正文（可选，如视频口播稿）：只存本地，永不导出 */
  content?: string;
}

export async function createManualEntry(input: ManualEntryInput) {
  const title = input.title.trim();
  if (!title) throw new ApiError("validation_error", "标题不能为空", 400, { field: "title" });

  let canonicalUrl: string;
  let parsed: URL;
  try {
    parsed = new URL(input.url.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
    canonicalUrl = canonicalizeUrl(input.url.trim());
  } catch {
    throw new ApiError("validation_error", "URL 必须为合法的 http/https 链接", 400, {
      field: "url",
    });
  }

  // 同一 URL 已存在（无论手动还是采集）：直接复用，走幂等草稿
  const existing = await prisma.article.findUnique({ where: { canonicalUrl } });
  if (existing) {
    const { entry, created } = await createDraftForArticle(existing.id);
    return { entry, created, reusedArticle: true };
  }

  const sourceName = input.sourceName?.trim() || parsed.hostname.replace(/^www\./, "");
  const normalizedUrl = `${MANUAL_SOURCE_TYPE}:${slugify(sourceName)}`;

  const source = await prisma.source.upsert({
    where: { normalizedUrl },
    create: {
      name: sourceName,
      type: MANUAL_SOURCE_TYPE,
      url: `manual://${slugify(sourceName)}`,
      normalizedUrl,
      // 手动记录的来源名称由用户亲手输入，视为可公开
      publicName: sourceName,
      exportAllowed: true,
      enabled: false,
      status: "disabled",
    },
    update: {},
  });

  const excerpt = input.excerpt?.trim() || null;
  const content = input.content?.trim() || null;
  const article = await prisma.article.create({
    data: {
      sourceId: source.id,
      canonicalUrl,
      originalUrl: input.url.trim(),
      title,
      normalizedTitle: normalizeTitle(title),
      excerpt,
      content,
      contentHash: contentHashOf(title, excerpt, content),
      language: /[一-鿿]/.test(title) ? "zh" : "en",
      status: "saved",
      aiStatus: "skipped",
    },
  });

  const { entry, created } = await createDraftForArticle(article.id);
  return { entry, created, reusedArticle: false };
}
