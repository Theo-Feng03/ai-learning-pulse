import { prisma } from "@/lib/db/client";

// 公开统计口径：只读取 status = published 的 LearningEntry。
// draft / confirmed / archived 一律不计入。

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PublishedStats {
  records90d: number;
  activeWeeks12: number;
  topicCount90d: number;
  linkedPracticeCount: number;
  heatmap: Array<{ date: string; count: number }>;
  topTopics: Array<{ name: string; count: number }>;
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 自然周起点（周一 00:00 UTC） */
export function weekStart(d: Date): string {
  const day = d.getUTCDay(); // 0=Sun
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
  return dateKey(monday);
}

export async function computePublishedStats(now: Date = new Date()): Promise<PublishedStats> {
  const since365 = new Date(now.getTime() - 365 * DAY_MS);
  const since90 = new Date(now.getTime() - 90 * DAY_MS);
  const since12w = new Date(now.getTime() - 12 * 7 * DAY_MS);

  const published = await prisma.learningEntry.findMany({
    where: { status: "published", publishedAt: { not: null, gte: since365 } },
    include: {
      topics: { include: { topic: true } },
      projectLinks: { where: { isPublic: true } },
    },
  });

  const heatmapMap = new Map<string, number>();
  const topicCount90 = new Map<string, number>();
  const activeWeekSet = new Set<string>();
  let records90d = 0;
  let linkedPracticeCount = 0;

  for (const entry of published) {
    const publishedAt = entry.publishedAt!;
    const key = dateKey(publishedAt);
    heatmapMap.set(key, (heatmapMap.get(key) ?? 0) + 1);

    if (publishedAt >= since90) {
      records90d++;
      for (const { topic } of entry.topics) {
        topicCount90.set(topic.name, (topicCount90.get(topic.name) ?? 0) + 1);
      }
    }
    if (publishedAt >= since12w) {
      activeWeekSet.add(weekStart(publishedAt));
    }
    if (entry.projectLinks.length > 0) {
      linkedPracticeCount++;
    }
  }

  // 完整 365 天热力图（无记录日 count=0），便于前端直接渲染
  const heatmap: Array<{ date: string; count: number }> = [];
  for (let i = 364; i >= 0; i--) {
    const date = dateKey(new Date(now.getTime() - i * DAY_MS));
    heatmap.push({ date, count: heatmapMap.get(date) ?? 0 });
  }

  const topTopics = [...topicCount90.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 10);

  return {
    records90d,
    activeWeeks12: activeWeekSet.size,
    topicCount90d: topicCount90.size,
    linkedPracticeCount,
    heatmap,
    topTopics,
  };
}
