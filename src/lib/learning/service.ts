import { ApiError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/client";
import { MIN_TAKEAWAY_LENGTH } from "@/types/domain";

const ENTRY_INCLUDE = {
  article: { include: { source: true, analysis: true } },
  topics: { include: { topic: true } },
  projectLinks: true,
} as const;

export async function getEntry(id: string) {
  const entry = await prisma.learningEntry.findUnique({ where: { id }, include: ENTRY_INCLUDE });
  if (!entry) throw new ApiError("not_found", "学习记录不存在", 404);
  return entry;
}

/**
 * 从文章创建学习草稿；已存在时返回已有草稿（幂等）。
 * userTakeaway 必须为空 —— AI 内容不得自动写入作者字段。
 */
export async function createDraftForArticle(articleId: string) {
  const article = await prisma.article.findUnique({ where: { id: articleId } });
  if (!article) throw new ApiError("not_found", "文章不存在", 404);

  const existing = await prisma.learningEntry.findUnique({ where: { articleId } });
  if (existing) return { entry: await getEntry(existing.id), created: false };

  const entry = await prisma.learningEntry.create({
    data: { articleId, status: "draft", userTakeaway: "" },
  });
  await prisma.article.update({ where: { id: articleId }, data: { status: "saved" } });
  return { entry: await getEntry(entry.id), created: true };
}

export interface EntryPatch {
  userTakeaway?: string;
  whyFollow?: string | null;
  impact?: string | null;
  topicIds?: string[];
  projectLinks?: Array<{
    projectName: string;
    projectUrl: string;
    note?: string | null;
    isPublic: boolean;
  }>;
}

/**
 * 编辑学习记录。
 * 核心作者字段（userTakeaway、主题）在 confirmed/published 状态被修改时，
 * 状态回到 draft，必须重新确认与发布。
 */
export async function updateEntry(id: string, patch: EntryPatch) {
  const entry = await getEntry(id);
  if (entry.status === "archived") {
    throw new ApiError("invalid_state", "已归档记录需先恢复才能编辑", 409);
  }

  const currentTopicIds = entry.topics.map((t) => t.topicId).sort();
  const nextTopicIds = patch.topicIds ? [...patch.topicIds].sort() : undefined;

  const coreChanged =
    (patch.userTakeaway !== undefined && patch.userTakeaway !== entry.userTakeaway) ||
    (nextTopicIds !== undefined && JSON.stringify(nextTopicIds) !== JSON.stringify(currentTopicIds));

  const revertToDraft =
    coreChanged && (entry.status === "confirmed" || entry.status === "published");

  await prisma.$transaction(async (tx) => {
    if (patch.topicIds) {
      await tx.learningEntryTopic.deleteMany({ where: { learningEntryId: id } });
      await tx.learningEntryTopic.createMany({
        data: patch.topicIds.map((topicId) => ({ learningEntryId: id, topicId })),
      });
    }
    if (patch.projectLinks) {
      await tx.projectLink.deleteMany({ where: { learningEntryId: id } });
      await tx.projectLink.createMany({
        data: patch.projectLinks.map((link) => ({
          learningEntryId: id,
          projectName: link.projectName,
          projectUrl: link.projectUrl,
          note: link.note ?? null,
          isPublic: link.isPublic,
        })),
      });
    }
    await tx.learningEntry.update({
      where: { id },
      data: {
        ...(patch.userTakeaway !== undefined ? { userTakeaway: patch.userTakeaway } : {}),
        ...(patch.whyFollow !== undefined ? { whyFollow: patch.whyFollow } : {}),
        ...(patch.impact !== undefined ? { impact: patch.impact } : {}),
        ...(revertToDraft
          ? { status: "draft", confirmedAt: null, publishedAt: null }
          : {}),
      },
    });
  });

  return { entry: await getEntry(id), revertedToDraft: revertToDraft };
}

export interface ValidationIssue {
  field: string;
  message: string;
}

/** 有效学习记录校验（Vibe Coding PRD 9.1） */
export function validateForConfirm(entry: {
  userTakeaway: string;
  topics: unknown[];
  article: { source: { name: string }; originalUrl: string } | null;
}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (entry.userTakeaway.trim().length < MIN_TAKEAWAY_LENGTH) {
    issues.push({
      field: "userTakeaway",
      message: `学习结论去除空白后不得少于 ${MIN_TAKEAWAY_LENGTH} 个字符`,
    });
  }
  if (entry.topics.length === 0) {
    issues.push({ field: "topics", message: "至少选择一个主题" });
  }
  if (!entry.article?.source?.name || !entry.article?.originalUrl) {
    issues.push({ field: "article", message: "缺少原始来源名称或 URL" });
  }
  return issues;
}

export async function confirmEntry(id: string) {
  const entry = await getEntry(id);
  if (entry.status !== "draft" && entry.status !== "confirmed") {
    throw new ApiError("invalid_state", `当前状态 ${entry.status} 不能执行确认`, 409);
  }
  const issues = validateForConfirm(entry);
  if (issues.length > 0) {
    throw new ApiError("validation_error", "尚不满足有效学习记录条件", 400, { issues });
  }
  return prisma.learningEntry.update({
    where: { id },
    data: { status: "confirmed", confirmedAt: entry.confirmedAt ?? new Date() },
    include: ENTRY_INCLUDE,
  });
}

export async function publishEntry(id: string) {
  const entry = await getEntry(id);
  if (entry.status !== "confirmed") {
    throw new ApiError(
      "invalid_state",
      entry.status === "draft"
        ? "草稿需要先确认为有效学习记录才能发布"
        : `当前状态 ${entry.status} 不能发布`,
      409,
    );
  }
  return prisma.learningEntry.update({
    where: { id },
    data: { status: "published", publishedAt: new Date() },
    include: ENTRY_INCLUDE,
  });
}

/** 撤回发布：published → confirmed，记录退出公开统计与下一次导出 */
export async function unpublishEntry(id: string) {
  const entry = await getEntry(id);
  if (entry.status !== "published") {
    throw new ApiError("invalid_state", "只有已发布记录可以撤回", 409);
  }
  return prisma.learningEntry.update({
    where: { id },
    data: { status: "confirmed", publishedAt: null },
    include: ENTRY_INCLUDE,
  });
}

export async function archiveEntry(id: string) {
  const entry = await getEntry(id);
  if (entry.status === "archived") return entry;
  return prisma.learningEntry.update({
    where: { id },
    data: { status: "archived", publishedAt: null },
    include: ENTRY_INCLUDE,
  });
}

/** 恢复归档：archived → confirmed（不自动回到 published） */
export async function restoreEntry(id: string) {
  const entry = await getEntry(id);
  if (entry.status !== "archived") {
    throw new ApiError("invalid_state", "只有已归档记录可以恢复", 409);
  }
  const issues = validateForConfirm(entry);
  return prisma.learningEntry.update({
    where: { id },
    data: issues.length === 0 ? { status: "confirmed" } : { status: "draft", confirmedAt: null },
    include: ENTRY_INCLUDE,
  });
}
