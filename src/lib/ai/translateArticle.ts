import { getProvider } from "@/lib/ai";
import type { ModelProvider, TargetLang } from "@/lib/ai/types";
import { ApiError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/client";

export interface TranslationResult {
  targetLang: TargetLang;
  title: string;
  excerpt: string | null;
  cached: boolean;
}

/**
 * 翻译文章标题与摘要（AI 生成内容，仅本地阅读，不进入导出）。
 * 结果按 (articleId, targetLang) 缓存；原文 contentHash 变化后缓存失效。
 */
export async function translateArticle(
  articleId: string,
  targetLang?: TargetLang,
  providerOverride?: ModelProvider | null,
): Promise<TranslationResult> {
  const article = await prisma.article.findUnique({ where: { id: articleId } });
  if (!article) throw new ApiError("not_found", "文章不存在", 404);

  const target: TargetLang = targetLang ?? (article.language === "zh" ? "en" : "zh");

  const cached = await prisma.articleTranslation.findUnique({
    where: { articleId_targetLang: { articleId, targetLang: target } },
  });
  if (cached && cached.contentHash === article.contentHash) {
    return { targetLang: target, title: cached.title, excerpt: cached.excerpt, cached: true };
  }

  const provider = providerOverride === undefined ? getProvider() : providerOverride;
  if (!provider) {
    throw new ApiError("model_not_configured", "未配置模型（no_ai 模式），无法翻译", 409);
  }

  const output = await provider.translateArticle({
    title: article.title,
    excerpt: article.excerpt ?? undefined,
    targetLang: target,
  });

  const saved = await prisma.articleTranslation.upsert({
    where: { articleId_targetLang: { articleId, targetLang: target } },
    create: {
      articleId,
      targetLang: target,
      title: output.title,
      excerpt: output.excerpt || null,
      contentHash: article.contentHash,
      provider: provider.providerName,
      modelName: provider.modelName,
    },
    update: {
      title: output.title,
      excerpt: output.excerpt || null,
      contentHash: article.contentHash,
      provider: provider.providerName,
      modelName: provider.modelName,
    },
  });

  return { targetLang: target, title: saved.title, excerpt: saved.excerpt, cached: false };
}
