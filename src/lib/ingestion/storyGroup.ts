import { prisma } from "@/lib/db/client";
import { normalizeTitle, titleSimilarity } from "@/lib/dedup/titleSimilarity";

const CANDIDATE_WINDOW_DAYS = 14;

/**
 * 轻量标题聚合：与近 14 天文章比对，相似度达到阈值时并入同一 StoryGroup。
 * 只聚合、不删除：相似文章保留为独立 Article。
 * 返回 storyGroupId（无相似文章时返回 null，不预创建组）。
 */
export async function assignStoryGroup(
  articleId: string,
  title: string,
  threshold: number,
): Promise<string | null> {
  const since = new Date(Date.now() - CANDIDATE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const candidates = await prisma.article.findMany({
    where: { id: { not: articleId }, createdAt: { gte: since } },
    select: { id: true, title: true, storyGroupId: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  for (const candidate of candidates) {
    if (titleSimilarity(title, candidate.title) < threshold) continue;

    if (candidate.storyGroupId) {
      await prisma.article.update({
        where: { id: articleId },
        data: { storyGroupId: candidate.storyGroupId },
      });
      return candidate.storyGroupId;
    }

    const group = await prisma.storyGroup.create({
      data: {
        normalizedTitle: normalizeTitle(candidate.title),
        primaryArticleId: candidate.id,
      },
    });
    await prisma.article.updateMany({
      where: { id: { in: [articleId, candidate.id] } },
      data: { storyGroupId: group.id },
    });
    return group.id;
  }

  return null;
}
