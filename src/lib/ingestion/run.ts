import type { Source } from "@prisma/client";
import { getProvider } from "@/lib/ai";
import { analyzeArticles } from "@/lib/ai/analyzeArticles";
import type { ModelProvider } from "@/lib/ai/types";
import { pLimit } from "@/lib/concurrency";
import { prisma } from "@/lib/db/client";
import { canonicalizeUrl } from "@/lib/dedup/canonicalUrl";
import { normalizeTitle } from "@/lib/dedup/titleSimilarity";
import { getEnv } from "@/lib/env";
import { contentHashOf } from "@/lib/hash";
import { getSettings } from "@/lib/settings";
import { defaultFetchContext, getAdapter } from "@/lib/sources";
import { AdapterError, type AdapterItem, type FetchContext } from "@/lib/sources/types";
import { assignStoryGroup } from "./storyGroup";

const DEGRADED_AFTER_FAILURES = 3;
const STALE_AFTER_MINUTES = 30;

export interface IngestionDeps {
  fetchContext?: FetchContext;
  /** undefined = 按环境变量解析；null = 强制 no_ai */
  provider?: ModelProvider | null;
}

export async function createRun(trigger: "manual" | "cli") {
  return prisma.ingestionRun.create({ data: { trigger, status: "created" } });
}

/** 应用启动 / 新建任务时调用：把超过 30 分钟仍在处理中的任务标记为 failed_stale */
export async function recoverStaleRuns() {
  const cutoff = new Date(Date.now() - STALE_AFTER_MINUTES * 60 * 1000);
  await prisma.ingestionRun.updateMany({
    where: {
      status: { in: ["created", "fetching", "normalizing", "analyzing"] },
      createdAt: { lt: cutoff },
    },
    data: { status: "failed_stale", completedAt: new Date() },
  });
}

interface SourceFetchResult {
  source: Source;
  items: AdapterItem[];
  error?: { code: string; message: string; retryable: boolean };
}

async function fetchAllSources(
  sources: Source[],
  ctx: FetchContext,
  concurrency: number,
): Promise<SourceFetchResult[]> {
  const limit = pLimit(concurrency);
  return Promise.all(
    sources.map((source) =>
      limit(async (): Promise<SourceFetchResult> => {
        try {
          const adapter = getAdapter(source.type);
          const items = await adapter.fetchItems(source, ctx);
          return { source, items };
        } catch (err) {
          const isAdapterError = err instanceof AdapterError;
          return {
            source,
            items: [],
            error: {
              code: isAdapterError ? err.code : "source_fetch_error",
              message: err instanceof Error ? err.message.slice(0, 300) : "抓取失败",
              retryable: isAdapterError ? err.retryable : true,
            },
          };
        }
      }),
    ),
  );
}

async function updateSourceHealth(result: SourceFetchResult) {
  if (result.error) {
    const failureCount = result.source.failureCount + 1;
    await prisma.source.update({
      where: { id: result.source.id },
      data: {
        failureCount,
        lastErrorCode: result.error.code,
        status: failureCount >= DEGRADED_AFTER_FAILURES ? "degraded" : result.source.status,
      },
    });
  } else {
    await prisma.source.update({
      where: { id: result.source.id },
      data: { failureCount: 0, lastErrorCode: null, lastSuccessAt: new Date(), status: "active" },
    });
  }
}

interface NormalizeResult {
  fetched: number;
  created: number;
  deduped: number;
  newArticleIds: string[];
  errors: Array<{ sourceId: string; code: string; message: string }>;
}

async function normalizeAndPersist(
  results: SourceFetchResult[],
  similarityThreshold: number,
  modelConfigured: boolean,
): Promise<NormalizeResult> {
  const out: NormalizeResult = { fetched: 0, created: 0, deduped: 0, newArticleIds: [], errors: [] };

  for (const { source, items, error } of results) {
    if (error) continue;
    out.fetched += items.length;

    for (const item of items) {
      let canonicalUrl: string;
      try {
        canonicalUrl = canonicalizeUrl(item.url);
      } catch {
        out.errors.push({
          sourceId: source.id,
          code: "invalid_url",
          message: `无法规范化 URL：${item.url.slice(0, 200)}`,
        });
        continue;
      }

      // canonical URL 幂等去重
      const existing = await prisma.article.findUnique({ where: { canonicalUrl } });
      if (existing) {
        out.deduped++;
        continue;
      }

      const article = await prisma.article.create({
        data: {
          sourceId: source.id,
          canonicalUrl,
          originalUrl: item.url,
          title: item.title,
          normalizedTitle: normalizeTitle(item.title),
          author: item.author,
          publishedAt: item.publishedAt,
          excerpt: item.excerpt,
          content: item.content,
          contentHash: contentHashOf(item.title, item.excerpt, item.content),
          language: /[一-鿿]/.test(item.title) ? "zh" : "en",
          status: "normalized",
          aiStatus: modelConfigured ? "pending" : "not_configured",
        },
      });
      out.created++;
      out.newArticleIds.push(article.id);

      // 标题相似聚合（只分组，不删除）
      await assignStoryGroup(article.id, article.title, similarityThreshold);
    }
  }
  return out;
}

/**
 * 执行一次完整采集：fetching → normalizing → analyzing → completed/partial_failed/failed。
 * 单信源失败不阻断其他信源。
 */
export async function runIngestion(runId: string, deps: IngestionDeps = {}) {
  const env = getEnv();
  const settings = await getSettings();
  const provider = deps.provider === undefined ? getProvider() : deps.provider;
  const ctx = deps.fetchContext ?? defaultFetchContext();
  const startedAt = new Date();

  const run = await prisma.ingestionRun.findUnique({ where: { id: runId } });
  if (!run) throw new Error(`IngestionRun 不存在：${runId}`);
  if (run.status !== "created") {
    // 幂等：同一个运行 ID 不允许重复执行
    return prisma.ingestionRun.findUniqueOrThrow({ where: { id: runId } });
  }

  try {
    const sources = await prisma.source.findMany({ where: { enabled: true } });
    await prisma.ingestionRun.update({
      where: { id: runId },
      data: { status: "fetching", startedAt, sourceTotal: sources.length },
    });

    const fetchResults = await fetchAllSources(sources, ctx, env.INGEST_CONCURRENCY);
    for (const result of fetchResults) {
      await updateSourceHealth(result);
      if (result.error) {
        await prisma.runError.create({
          data: {
            runId,
            sourceId: result.source.id,
            stage: "fetch",
            code: result.error.code,
            message: result.error.message,
            retryable: result.error.retryable,
          },
        });
      }
    }
    const sourceFailed = fetchResults.filter((r) => r.error).length;
    const sourceSuccess = fetchResults.length - sourceFailed;

    await prisma.ingestionRun.update({
      where: { id: runId },
      data: { status: "normalizing", sourceSuccess, sourceFailed },
    });

    const normalized = await normalizeAndPersist(
      fetchResults,
      settings.titleSimilarityThreshold,
      Boolean(provider),
    );
    for (const err of normalized.errors) {
      await prisma.runError.create({
        data: {
          runId,
          sourceId: err.sourceId,
          stage: "normalize",
          code: err.code,
          message: err.message,
          retryable: false,
        },
      });
    }

    await prisma.ingestionRun.update({
      where: { id: runId },
      data: {
        status: "analyzing",
        fetchedCount: normalized.fetched,
        newCount: normalized.created,
        dedupCount: normalized.deduped,
      },
    });

    const analysis = await analyzeArticles(normalized.newArticleIds, provider, {
      maxPerRun: settings.aiMaxPerRun,
    });
    for (const err of analysis.errors) {
      await prisma.runError.create({
        data: {
          runId,
          articleId: err.articleId,
          stage: "analyze",
          code: err.code,
          message: err.message,
          retryable: err.retryable,
        },
      });
    }

    const anyFailure = sourceFailed > 0 || analysis.aiFailed > 0 || normalized.errors.length > 0;
    const allSourcesFailed = sources.length > 0 && sourceFailed === sources.length;
    const finalStatus = allSourcesFailed ? "failed" : anyFailure ? "partial_failed" : "completed";

    const errorSummary =
      sourceFailed > 0 || analysis.aiFailed > 0
        ? JSON.stringify({
            sourceFailed,
            aiFailed: analysis.aiFailed,
            normalizeErrors: normalized.errors.length,
          })
        : null;

    return await prisma.ingestionRun.update({
      where: { id: runId },
      data: {
        status: finalStatus,
        completedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
        aiSuccess: analysis.aiSuccess,
        aiFailed: analysis.aiFailed,
        aiSkipped: analysis.aiSkipped,
        errorSummary,
      },
    });
  } catch (err) {
    // 不把堆栈写入数据库
    await prisma.runError.create({
      data: {
        runId,
        stage: "fetch",
        code: "run_crashed",
        message: err instanceof Error ? err.message.slice(0, 300) : "采集任务异常终止",
        retryable: true,
      },
    });
    return prisma.ingestionRun.update({
      where: { id: runId },
      data: {
        status: "failed",
        completedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
      },
    });
  }
}
