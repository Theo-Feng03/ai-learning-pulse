import { z } from "zod";
import { prisma } from "@/lib/db/client";

// 双机同步的便携快照：
// - 用自然键（canonicalUrl / normalizedUrl / slug）标识记录，不携带机器本地的 cuid，
//   两台电脑各自采集到同一篇文章时能正确合并成一条。
// - 合并规则：有 updatedAt 的表按记录级 LWW（谁新用谁）；无时间戳的表只补缺不覆盖。
// - StoryGroup（标题聚合）是派生数据，不进入快照，由各机自行计算。
// - 运行日志（IngestionRun/RunError/ExportRun）属于机器本地观测数据，不同步。
// - 不做删除同步（无墓碑）：一台机器删掉的数据若另一台还有，会在合并时回来。

export const SYNC_SCHEMA_VERSION = 1;

const isoDate = z.string();
const isoDateNullable = z.string().nullable();

export const syncSnapshotSchema = z.object({
  syncSchemaVersion: z.literal(SYNC_SCHEMA_VERSION),
  exportedAt: isoDate,
  hostname: z.string(),
  sources: z.array(
    z.object({
      normalizedUrl: z.string(),
      name: z.string(),
      type: z.string(),
      url: z.string(),
      publicName: z.string().nullable(),
      exportAllowed: z.boolean(),
      enabled: z.boolean(),
      status: z.string(),
      failureCount: z.number().int(),
      lastSuccessAt: isoDateNullable,
      lastErrorCode: z.string().nullable(),
      createdAt: isoDate,
      updatedAt: isoDate,
    }),
  ),
  topics: z.array(
    z.object({
      slug: z.string(),
      name: z.string(),
      color: z.string().nullable(),
      createdAt: isoDate,
    }),
  ),
  articles: z.array(
    z.object({
      canonicalUrl: z.string(),
      sourceNormalizedUrl: z.string(),
      originalUrl: z.string(),
      title: z.string(),
      normalizedTitle: z.string(),
      author: z.string().nullable(),
      publishedAt: isoDateNullable,
      excerpt: z.string().nullable(),
      content: z.string().nullable(),
      contentHash: z.string(),
      language: z.string().nullable(),
      status: z.string(),
      aiStatus: z.string(),
      createdAt: isoDate,
      updatedAt: isoDate,
    }),
  ),
  analyses: z.array(
    z.object({
      articleCanonicalUrl: z.string(),
      relevanceScore: z.number().int(),
      titleZh: z.string().nullable(),
      category: z.string(),
      topics: z.string(),
      summaryZh: z.string(),
      whyItMatters: z.string(),
      confidence: z.number(),
      insufficientContent: z.boolean(),
      provider: z.string(),
      modelName: z.string(),
      promptVersion: z.string(),
      inputHash: z.string(),
      createdAt: isoDate,
    }),
  ),
  translations: z.array(
    z.object({
      articleCanonicalUrl: z.string(),
      targetLang: z.string(),
      title: z.string(),
      excerpt: z.string().nullable(),
      contentHash: z.string(),
      provider: z.string(),
      modelName: z.string(),
      createdAt: isoDate,
      updatedAt: isoDate,
    }),
  ),
  entries: z.array(
    z.object({
      articleCanonicalUrl: z.string(),
      status: z.string(),
      userTakeaway: z.string(),
      whyFollow: z.string().nullable(),
      impact: z.string().nullable(),
      confirmedAt: isoDateNullable,
      publishedAt: isoDateNullable,
      createdAt: isoDate,
      updatedAt: isoDate,
      topicSlugs: z.array(z.string()),
      projectLinks: z.array(
        z.object({
          projectName: z.string(),
          projectUrl: z.string(),
          note: z.string().nullable(),
          isPublic: z.boolean(),
        }),
      ),
    }),
  ),
  settings: z.array(
    z.object({
      key: z.string(),
      value: z.string(),
      updatedAt: isoDate,
    }),
  ),
});

export type SyncSnapshot = z.infer<typeof syncSnapshotSchema>;

const iso = (d: Date) => d.toISOString();
const isoOrNull = (d: Date | null) => (d ? d.toISOString() : null);
const byKey = <T>(arr: T[], key: (t: T) => string) =>
  [...arr].sort((a, b) => key(a).localeCompare(key(b)));

/** 导出本机数据为便携快照（排序保证 git diff 稳定） */
export async function buildSnapshot(hostname: string): Promise<SyncSnapshot> {
  const [sources, topics, articles, entries, settings] = await Promise.all([
    prisma.source.findMany(),
    prisma.topic.findMany(),
    prisma.article.findMany({ include: { source: true, analysis: true, translations: true } }),
    prisma.learningEntry.findMany({
      include: { article: true, topics: { include: { topic: true } }, projectLinks: true },
    }),
    prisma.appSetting.findMany(),
  ]);

  return {
    syncSchemaVersion: SYNC_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    hostname,
    sources: byKey(
      sources.map((s) => ({
        normalizedUrl: s.normalizedUrl,
        name: s.name,
        type: s.type,
        url: s.url,
        publicName: s.publicName,
        exportAllowed: s.exportAllowed,
        enabled: s.enabled,
        status: s.status,
        failureCount: s.failureCount,
        lastSuccessAt: isoOrNull(s.lastSuccessAt),
        lastErrorCode: s.lastErrorCode,
        createdAt: iso(s.createdAt),
        updatedAt: iso(s.updatedAt),
      })),
      (s) => s.normalizedUrl,
    ),
    topics: byKey(
      topics.map((t) => ({
        slug: t.slug,
        name: t.name,
        color: t.color,
        createdAt: iso(t.createdAt),
      })),
      (t) => t.slug,
    ),
    articles: byKey(
      articles.map((a) => ({
        canonicalUrl: a.canonicalUrl,
        sourceNormalizedUrl: a.source.normalizedUrl,
        originalUrl: a.originalUrl,
        title: a.title,
        normalizedTitle: a.normalizedTitle,
        author: a.author,
        publishedAt: isoOrNull(a.publishedAt),
        excerpt: a.excerpt,
        content: a.content,
        contentHash: a.contentHash,
        language: a.language,
        status: a.status,
        aiStatus: a.aiStatus,
        createdAt: iso(a.createdAt),
        updatedAt: iso(a.updatedAt),
      })),
      (a) => a.canonicalUrl,
    ),
    analyses: byKey(
      articles
        .filter((a) => a.analysis)
        .map((a) => ({
          articleCanonicalUrl: a.canonicalUrl,
          relevanceScore: a.analysis!.relevanceScore,
          titleZh: a.analysis!.titleZh,
          category: a.analysis!.category,
          topics: a.analysis!.topics,
          summaryZh: a.analysis!.summaryZh,
          whyItMatters: a.analysis!.whyItMatters,
          confidence: a.analysis!.confidence,
          insufficientContent: a.analysis!.insufficientContent,
          provider: a.analysis!.provider,
          modelName: a.analysis!.modelName,
          promptVersion: a.analysis!.promptVersion,
          inputHash: a.analysis!.inputHash,
          createdAt: iso(a.analysis!.createdAt),
        })),
      (x) => x.articleCanonicalUrl,
    ),
    translations: byKey(
      articles.flatMap((a) =>
        a.translations.map((t) => ({
          articleCanonicalUrl: a.canonicalUrl,
          targetLang: t.targetLang,
          title: t.title,
          excerpt: t.excerpt,
          contentHash: t.contentHash,
          provider: t.provider,
          modelName: t.modelName,
          createdAt: iso(t.createdAt),
          updatedAt: iso(t.updatedAt),
        })),
      ),
      (t) => `${t.articleCanonicalUrl}|${t.targetLang}`,
    ),
    entries: byKey(
      entries.map((e) => ({
        articleCanonicalUrl: e.article.canonicalUrl,
        status: e.status,
        userTakeaway: e.userTakeaway,
        whyFollow: e.whyFollow,
        impact: e.impact,
        confirmedAt: isoOrNull(e.confirmedAt),
        publishedAt: isoOrNull(e.publishedAt),
        createdAt: iso(e.createdAt),
        updatedAt: iso(e.updatedAt),
        topicSlugs: e.topics.map((t) => t.topic.slug).sort(),
        projectLinks: byKey(
          e.projectLinks.map((l) => ({
            projectName: l.projectName,
            projectUrl: l.projectUrl,
            note: l.note,
            isPublic: l.isPublic,
          })),
          (l) => l.projectUrl,
        ),
      })),
      (e) => e.articleCanonicalUrl,
    ),
    settings: byKey(
      settings.map((s) => ({ key: s.key, value: s.value, updatedAt: iso(s.updatedAt) })),
      (s) => s.key,
    ),
  };
}

export interface MergeStats {
  created: number;
  updated: number;
  unchanged: number;
}

const newer = (remote: string, local: Date) => new Date(remote).getTime() > local.getTime();

/** 把远端快照合并进本地数据库（记录级 LWW；调用方负责先备份数据库） */
export async function applySnapshot(snapshot: SyncSnapshot): Promise<MergeStats> {
  const stats: MergeStats = { created: 0, updated: 0, unchanged: 0 };

  // 1. 信源：按 normalizedUrl
  for (const s of snapshot.sources) {
    const local = await prisma.source.findUnique({ where: { normalizedUrl: s.normalizedUrl } });
    const data = {
      name: s.name,
      type: s.type,
      url: s.url,
      publicName: s.publicName,
      exportAllowed: s.exportAllowed,
      enabled: s.enabled,
      status: s.status,
      failureCount: s.failureCount,
      lastSuccessAt: s.lastSuccessAt ? new Date(s.lastSuccessAt) : null,
      lastErrorCode: s.lastErrorCode,
      updatedAt: new Date(s.updatedAt),
    };
    if (!local) {
      await prisma.source.create({
        data: { ...data, normalizedUrl: s.normalizedUrl, createdAt: new Date(s.createdAt) },
      });
      stats.created++;
    } else if (newer(s.updatedAt, local.updatedAt)) {
      await prisma.source.update({ where: { id: local.id }, data });
      stats.updated++;
    } else {
      stats.unchanged++;
    }
  }
  const sourceIdByUrl = new Map(
    (await prisma.source.findMany()).map((s) => [s.normalizedUrl, s.id]),
  );

  // 2. 主题：按 slug，只补缺（无 updatedAt）
  for (const t of snapshot.topics) {
    const local = await prisma.topic.findUnique({ where: { slug: t.slug } });
    if (!local) {
      await prisma.topic.create({
        data: { slug: t.slug, name: t.name, color: t.color, createdAt: new Date(t.createdAt) },
      });
      stats.created++;
    } else {
      stats.unchanged++;
    }
  }
  const topicIdBySlug = new Map((await prisma.topic.findMany()).map((t) => [t.slug, t.id]));

  // 3. 文章：按 canonicalUrl
  const articleIdByUrl = new Map<string, string>();
  for (const a of snapshot.articles) {
    const sourceId = sourceIdByUrl.get(a.sourceNormalizedUrl);
    if (!sourceId) continue; // 理论上不会发生：信源已先合并
    const local = await prisma.article.findUnique({ where: { canonicalUrl: a.canonicalUrl } });
    const data = {
      originalUrl: a.originalUrl,
      title: a.title,
      normalizedTitle: a.normalizedTitle,
      author: a.author,
      publishedAt: a.publishedAt ? new Date(a.publishedAt) : null,
      excerpt: a.excerpt,
      content: a.content,
      contentHash: a.contentHash,
      language: a.language,
      status: a.status,
      aiStatus: a.aiStatus,
      updatedAt: new Date(a.updatedAt),
    };
    if (!local) {
      const created = await prisma.article.create({
        data: {
          ...data,
          sourceId,
          canonicalUrl: a.canonicalUrl,
          createdAt: new Date(a.createdAt),
        },
      });
      articleIdByUrl.set(a.canonicalUrl, created.id);
      stats.created++;
    } else {
      articleIdByUrl.set(a.canonicalUrl, local.id);
      if (newer(a.updatedAt, local.updatedAt)) {
        await prisma.article.update({ where: { id: local.id }, data });
        stats.updated++;
      } else {
        stats.unchanged++;
      }
    }
  }

  // 4. AI 分析：按文章，无 updatedAt → 按 createdAt LWW
  for (const an of snapshot.analyses) {
    const articleId = articleIdByUrl.get(an.articleCanonicalUrl);
    if (!articleId) continue;
    const local = await prisma.aIAnalysis.findUnique({ where: { articleId } });
    const data = {
      relevanceScore: an.relevanceScore,
      titleZh: an.titleZh,
      category: an.category,
      topics: an.topics,
      summaryZh: an.summaryZh,
      whyItMatters: an.whyItMatters,
      confidence: an.confidence,
      insufficientContent: an.insufficientContent,
      provider: an.provider,
      modelName: an.modelName,
      promptVersion: an.promptVersion,
      inputHash: an.inputHash,
      createdAt: new Date(an.createdAt),
    };
    if (!local) {
      await prisma.aIAnalysis.create({ data: { ...data, articleId } });
      stats.created++;
    } else if (newer(an.createdAt, local.createdAt)) {
      await prisma.aIAnalysis.update({ where: { articleId }, data });
      stats.updated++;
    } else {
      stats.unchanged++;
    }
  }

  // 5. 翻译缓存：按 (文章, 目标语言)
  for (const tr of snapshot.translations) {
    const articleId = articleIdByUrl.get(tr.articleCanonicalUrl);
    if (!articleId) continue;
    const local = await prisma.articleTranslation.findUnique({
      where: { articleId_targetLang: { articleId, targetLang: tr.targetLang } },
    });
    const data = {
      title: tr.title,
      excerpt: tr.excerpt,
      contentHash: tr.contentHash,
      provider: tr.provider,
      modelName: tr.modelName,
      updatedAt: new Date(tr.updatedAt),
    };
    if (!local) {
      await prisma.articleTranslation.create({
        data: { ...data, articleId, targetLang: tr.targetLang, createdAt: new Date(tr.createdAt) },
      });
      stats.created++;
    } else if (newer(tr.updatedAt, local.updatedAt)) {
      await prisma.articleTranslation.update({
        where: { articleId_targetLang: { articleId, targetLang: tr.targetLang } },
        data,
      });
      stats.updated++;
    } else {
      stats.unchanged++;
    }
  }

  // 6. 学习记录：按文章 LWW；远端取胜时子表（主题/项目关联）整体跟随
  for (const e of snapshot.entries) {
    const articleId = articleIdByUrl.get(e.articleCanonicalUrl);
    if (!articleId) continue;
    const local = await prisma.learningEntry.findUnique({ where: { articleId } });
    const data = {
      status: e.status,
      userTakeaway: e.userTakeaway,
      whyFollow: e.whyFollow,
      impact: e.impact,
      confirmedAt: e.confirmedAt ? new Date(e.confirmedAt) : null,
      publishedAt: e.publishedAt ? new Date(e.publishedAt) : null,
      updatedAt: new Date(e.updatedAt),
    };

    let entryId: string;
    let remoteWins = false;
    if (!local) {
      const created = await prisma.learningEntry.create({
        data: { ...data, articleId, createdAt: new Date(e.createdAt) },
      });
      entryId = created.id;
      remoteWins = true;
      stats.created++;
    } else if (newer(e.updatedAt, local.updatedAt)) {
      await prisma.learningEntry.update({ where: { id: local.id }, data });
      entryId = local.id;
      remoteWins = true;
      stats.updated++;
    } else {
      entryId = local.id;
      stats.unchanged++;
    }

    if (remoteWins) {
      await prisma.learningEntryTopic.deleteMany({ where: { learningEntryId: entryId } });
      const topicIds = e.topicSlugs
        .map((slug) => topicIdBySlug.get(slug))
        .filter((id): id is string => Boolean(id));
      await prisma.learningEntryTopic.createMany({
        data: topicIds.map((topicId) => ({ learningEntryId: entryId, topicId })),
      });
      await prisma.projectLink.deleteMany({ where: { learningEntryId: entryId } });
      await prisma.projectLink.createMany({
        data: e.projectLinks.map((l) => ({
          learningEntryId: entryId,
          projectName: l.projectName,
          projectUrl: l.projectUrl,
          note: l.note,
          isPublic: l.isPublic,
        })),
      });
    }
  }

  // 7. 应用设置：按 key LWW
  for (const s of snapshot.settings) {
    const local = await prisma.appSetting.findUnique({ where: { key: s.key } });
    if (!local) {
      await prisma.appSetting.create({
        data: { key: s.key, value: s.value, updatedAt: new Date(s.updatedAt) },
      });
      stats.created++;
    } else if (newer(s.updatedAt, local.updatedAt)) {
      await prisma.appSetting.update({
        where: { key: s.key },
        data: { value: s.value, updatedAt: new Date(s.updatedAt) },
      });
      stats.updated++;
    } else {
      stats.unchanged++;
    }
  }

  return stats;
}
