import type { Article, Source } from "@prisma/client";
import { pLimit } from "@/lib/concurrency";
import { prisma } from "@/lib/db/client";
import { getEnv } from "@/lib/env";
import { analysisInputHash } from "@/lib/hash";
import { ALLOWED_TOPICS, PROMPT_VERSION } from "@/types/domain";
import { ModelError, type ModelProvider } from "./types";

export interface AnalyzeStageResult {
  aiSuccess: number;
  aiFailed: number;
  aiSkipped: number;
  errors: Array<{ articleId: string; code: string; message: string; retryable: boolean }>;
}

type ArticleWithSource = Article & { source: Source };

async function analyzeOne(
  provider: ModelProvider,
  article: ArticleWithSource,
): Promise<void> {
  const inputHash = analysisInputHash(article.contentHash, PROMPT_VERSION, provider.modelName);

  // 缓存：相同内容 + prompt 版本 + 模型已有结果时跳过
  const existing = await prisma.aIAnalysis.findUnique({ where: { articleId: article.id } });
  if (existing && existing.inputHash === inputHash) {
    await prisma.article.update({
      where: { id: article.id },
      data: { status: "analyzed", aiStatus: "analyzed" },
    });
    throw new SkipSignal();
  }

  const callOnce = () =>
    provider.analyzeArticle({
      title: article.title,
      sourceName: article.source.name,
      publishedAt: article.publishedAt?.toISOString(),
      originalLanguage: article.language ?? undefined,
      excerpt: article.excerpt ?? undefined,
      content: article.content?.slice(0, 8000) ?? undefined,
      configuredInterests: [],
      allowedTopics: [...ALLOWED_TOPICS],
    });

  let output;
  try {
    output = await callOnce();
  } catch (err) {
    // 超时或 5xx：指数退避重试一次
    if (err instanceof ModelError && err.retryable) {
      await new Promise((r) => setTimeout(r, 1000));
      output = await callOnce();
    } else {
      throw err;
    }
  }

  await prisma.$transaction([
    prisma.aIAnalysis.upsert({
      where: { articleId: article.id },
      create: {
        articleId: article.id,
        relevanceScore: output.relevanceScore,
        category: output.category,
        topics: JSON.stringify(output.topics),
        summaryZh: output.summaryZh,
        whyItMatters: output.whyItMatters,
        confidence: output.confidence,
        insufficientContent: output.insufficientContent,
        provider: provider.providerName,
        modelName: provider.modelName,
        promptVersion: PROMPT_VERSION,
        inputHash,
      },
      update: {
        relevanceScore: output.relevanceScore,
        category: output.category,
        topics: JSON.stringify(output.topics),
        summaryZh: output.summaryZh,
        whyItMatters: output.whyItMatters,
        confidence: output.confidence,
        insufficientContent: output.insufficientContent,
        provider: provider.providerName,
        modelName: provider.modelName,
        promptVersion: PROMPT_VERSION,
        inputHash,
      },
    }),
    prisma.article.update({
      where: { id: article.id },
      data: { status: "analyzed", aiStatus: "analyzed" },
    }),
  ]);
}

class SkipSignal extends Error {}

/**
 * analyzing 阶段：对新入库文章批量执行 AI 分析。
 * provider 为 null 时进入 no_ai：文章保持可用，仅标记 not_configured。
 */
export async function analyzeArticles(
  articleIds: string[],
  provider: ModelProvider | null,
  options?: { maxPerRun?: number; concurrency?: number },
): Promise<AnalyzeStageResult> {
  const result: AnalyzeStageResult = { aiSuccess: 0, aiFailed: 0, aiSkipped: 0, errors: [] };
  if (articleIds.length === 0) return result;

  if (!provider) {
    await prisma.article.updateMany({
      where: { id: { in: articleIds } },
      data: { aiStatus: "not_configured" },
    });
    result.aiSkipped = articleIds.length;
    return result;
  }

  const env = getEnv();
  const maxPerRun = options?.maxPerRun ?? env.AI_MAX_PER_RUN;
  const concurrency = options?.concurrency ?? env.AI_CONCURRENCY;

  const toProcess = articleIds.slice(0, maxPerRun);
  const overflow = articleIds.slice(maxPerRun);

  if (overflow.length > 0) {
    await prisma.article.updateMany({
      where: { id: { in: overflow } },
      data: { aiStatus: "queued" },
    });
    result.aiSkipped += overflow.length;
  }

  const articles = await prisma.article.findMany({
    where: { id: { in: toProcess } },
    include: { source: true },
  });

  let rateLimited = false;
  const limit = pLimit(concurrency);

  await Promise.all(
    articles.map((article) =>
      limit(async () => {
        if (rateLimited) {
          await prisma.article.update({
            where: { id: article.id },
            data: { aiStatus: "rate_limited" },
          });
          result.aiSkipped++;
          return;
        }
        try {
          await analyzeOne(provider, article);
          result.aiSuccess++;
        } catch (err) {
          if (err instanceof SkipSignal) {
            result.aiSkipped++;
            return;
          }
          if (err instanceof ModelError && err.code === "rate_limited") {
            // 429：本次运行停止新增 AI 调用
            rateLimited = true;
            await prisma.article.update({
              where: { id: article.id },
              data: { aiStatus: "rate_limited" },
            });
            result.aiSkipped++;
            result.errors.push({
              articleId: article.id,
              code: "rate_limited",
              message: err.message,
              retryable: true,
            });
            return;
          }
          result.aiFailed++;
          await prisma.article.update({
            where: { id: article.id },
            data: { status: "analyze_failed", aiStatus: "analyze_failed" },
          });
          result.errors.push({
            articleId: article.id,
            code: err instanceof ModelError ? err.code : "analyze_error",
            message: err instanceof Error ? err.message.slice(0, 300) : "AI 分析失败",
            retryable: err instanceof ModelError ? err.retryable : false,
          });
        }
      }),
    ),
  );

  return result;
}
