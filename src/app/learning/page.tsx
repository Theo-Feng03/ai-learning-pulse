import Link from "next/link";
import { Heatmap } from "@/components/Heatmap";
import { Badge, Card, entryStatusTone, StatTile } from "@/components/ui";
import { computePublishedStats } from "@/lib/analytics/stats";
import { prisma } from "@/lib/db/client";
import { ENTRY_STATUS_LABELS, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function LearningPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; topic?: string }>;
}) {
  const { status, topic } = await searchParams;
  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (topic) where.topics = { some: { topic: { slug: topic } } };

  const [entries, stats, topics] = await Promise.all([
    prisma.learningEntry.findMany({
      where,
      orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
      take: 200,
      include: {
        article: { include: { source: { select: { name: true } } } },
        topics: { include: { topic: true } },
        projectLinks: true,
      },
    }),
    computePublishedStats(),
    prisma.topic.findMany({ orderBy: { name: "asc" } }),
  ]);

  const filterLink = (params: Record<string, string | undefined>) => {
    const merged = { status, topic, ...params };
    const qs = new URLSearchParams();
    if (merged.status) qs.set("status", merged.status);
    if (merged.topic) qs.set("topic", merged.topic);
    const s = qs.toString();
    return s ? `/learning?${s}` : "/learning";
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">学习时间线</h1>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="90 天记录" value={stats.records90d} hint="仅已发布" />
        <StatTile label="12 周活跃周" value={stats.activeWeeks12} hint="每周至少发布 1 条" />
        <StatTile label="90 天主题数" value={stats.topicCount90d} />
        <StatTile label="实践关联" value={stats.linkedPracticeCount} hint="含公开项目链接" />
      </div>

      <Card title="学习热力图（最近 90 天，仅已发布）">
        <Heatmap data={stats.heatmap} days={90} />
      </Card>

      <Card>
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-xs text-stone-500">状态：</span>
          <Link href={filterLink({ status: undefined })}
            className={!status ? "font-semibold underline" : "hover:underline"}>
            全部
          </Link>
          {Object.entries(ENTRY_STATUS_LABELS).map(([value, label]) => (
            <Link key={value} href={filterLink({ status: value })}
              className={status === value ? "font-semibold underline" : "hover:underline"}>
              {label}
            </Link>
          ))}
          <span className="ml-3 text-xs text-stone-500">主题：</span>
          <Link href={filterLink({ topic: undefined })}
            className={!topic ? "font-semibold underline" : "hover:underline"}>
            全部
          </Link>
          {topics.map((t) => (
            <Link key={t.id} href={filterLink({ topic: t.slug })}
              className={topic === t.slug ? "font-semibold underline" : "hover:underline"}>
              {t.name}
            </Link>
          ))}
        </div>
      </Card>

      {entries.length === 0 ? (
        <Card>
          <p className="text-sm text-stone-500">
            没有匹配的学习记录。从<Link href="/inbox" className="underline">收件箱</Link>保存资讯为草稿开始。
          </p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-lg border border-stone-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/learning/${entry.id}`} className="font-medium hover:underline">
                    {entry.article.title}
                  </Link>
                  <p className="mt-0.5 text-xs text-stone-400">
                    {entry.article.source.name}｜
                    {entry.status === "published"
                      ? `发布于 ${formatDateTime(entry.publishedAt)}`
                      : `更新于 ${formatDateTime(entry.updatedAt)}`}
                  </p>
                  {entry.userTakeaway ? (
                    <p className="mt-1 line-clamp-2 text-sm text-stone-700">
                      <span className="text-xs text-emerald-700">【我的记录】</span>
                      {entry.userTakeaway}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-stone-400">尚未填写学习结论。</p>
                  )}
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Badge tone={entryStatusTone(entry.status)}>
                      {ENTRY_STATUS_LABELS[entry.status] ?? entry.status}
                    </Badge>
                    {entry.topics.map((t) => (
                      <Badge key={t.topicId}>{t.topic.name}</Badge>
                    ))}
                    {entry.projectLinks.length > 0 ? (
                      <Badge tone="purple">实践关联 {entry.projectLinks.length}</Badge>
                    ) : null}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
