import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { computePublishedStats } from "@/lib/analytics/stats";
import { prisma } from "@/lib/db/client";
import { getEnv } from "@/lib/env";
import { SHOWCASE_SCHEMA_VERSION } from "@/types/domain";
import { showcaseSchema, type ShowcaseEntry, type ShowcasePayload } from "./schema";

export const SHOWCASE_FILENAME = "showcase.json";

/** 白名单字段映射的输入：已发布记录及其关联数据 */
export interface PublishedEntryData {
  id: string;
  userTakeaway: string;
  whyFollow: string | null;
  impact: string | null;
  publishedAt: Date;
  article: {
    title: string;
    originalUrl: string;
    publishedAt: Date | null;
    source: { name: string; publicName: string | null };
    analysis: { summaryZh: string } | null;
  };
  topics: Array<{ topic: { name: string } }>;
  projectLinks: Array<{
    projectName: string;
    projectUrl: string;
    note: string | null;
    isPublic: boolean;
  }>;
}

/**
 * 白名单映射：逐字段构造导出对象。
 * 禁止使用展开运算符复制整个数据库对象 —— 每个导出字段必须在这里显式写出。
 */
export function toShowcaseEntry(entry: PublishedEntryData): ShowcaseEntry {
  return {
    id: entry.id,
    title: entry.article.title,
    sourceName: entry.article.source.publicName || entry.article.source.name,
    sourceUrl: entry.article.originalUrl,
    sourcePublishedAt: entry.article.publishedAt?.toISOString() ?? "",
    summaryZh: entry.article.analysis?.summaryZh ?? "",
    userTakeaway: entry.userTakeaway,
    whyFollow: entry.whyFollow ?? "",
    impact: entry.impact ?? "",
    topics: entry.topics.map((t) => t.topic.name),
    projectLinks: entry.projectLinks
      .filter((link) => link.isPublic)
      .map((link) => ({
        projectName: link.projectName,
        projectUrl: link.projectUrl,
        note: link.note ?? "",
      })),
    publishedAt: entry.publishedAt.toISOString(),
  };
}

export async function buildShowcasePayload(now: Date = new Date()): Promise<ShowcasePayload> {
  const stats = await computePublishedStats(now);
  const published = await prisma.learningEntry.findMany({
    where: { status: "published", publishedAt: { not: null } },
    include: {
      article: { include: { source: true, analysis: true } },
      topics: { include: { topic: true } },
      projectLinks: true,
    },
    orderBy: { publishedAt: "desc" },
  });

  return {
    schemaVersion: SHOWCASE_SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    profile: {
      productName: "AI Learning Pulse",
      description: "个人 AI 学习雷达",
      githubUrl: process.env.SHOWCASE_GITHUB_URL ?? "",
    },
    stats: {
      records90d: stats.records90d,
      activeWeeks12: stats.activeWeeks12,
      topicCount90d: stats.topicCount90d,
      linkedPracticeCount: stats.linkedPracticeCount,
    },
    heatmap: stats.heatmap,
    topics: stats.topTopics,
    entries: published.map((entry) =>
      toShowcaseEntry({ ...entry, publishedAt: entry.publishedAt! }),
    ),
  };
}

export function showcaseFilePath(): string {
  return path.resolve(process.cwd(), getEnv().EXPORT_DIR ?? "exports", SHOWCASE_FILENAME);
}

export interface ExportResult {
  path: string;
  count: number;
  checksum: string;
}

/**
 * 导出 showcase.json：Zod 校验 → 写临时文件 → 原子替换。
 * 失败时保留上一个成功版本，并写入 export_failed 的 ExportRun。
 */
export async function exportShowcase(deps?: {
  buildPayload?: () => Promise<ShowcasePayload>;
  writeFileImpl?: typeof writeFile;
}): Promise<ExportResult> {
  const filePath = showcaseFilePath();
  const tmpPath = `${filePath}.tmp`;
  const write = deps?.writeFileImpl ?? writeFile;

  try {
    const payload = await (deps?.buildPayload ?? buildShowcasePayload)();
    const validated = showcaseSchema.parse(payload);
    const json = JSON.stringify(validated, null, 2);
    const checksum = createHash("sha256").update(json, "utf8").digest("hex");

    mkdirSync(path.dirname(filePath), { recursive: true });
    await write(tmpPath, json, "utf8");
    await rename(tmpPath, filePath);

    await prisma.exportRun.create({
      data: {
        status: "success",
        schemaVersion: SHOWCASE_SCHEMA_VERSION,
        // 只记录相对文件名，避免本地绝对路径进入数据库
        filePath: SHOWCASE_FILENAME,
        recordCount: validated.entries.length,
        checksum,
      },
    });

    return { path: filePath, count: validated.entries.length, checksum };
  } catch (err) {
    await unlink(tmpPath).catch(() => {});
    await prisma.exportRun.create({
      data: {
        status: "export_failed",
        schemaVersion: SHOWCASE_SCHEMA_VERSION,
        filePath: SHOWCASE_FILENAME,
        recordCount: 0,
        errorMessage: err instanceof Error ? err.message.slice(0, 300) : "导出失败",
      },
    });
    throw err;
  }
}
