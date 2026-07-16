import Link from "next/link";
import { ExportButton } from "@/components/ExportButton";
import { Heatmap } from "@/components/Heatmap";
import { IngestButton } from "@/components/IngestButton";
import { Badge, Card, runStatusTone, StatTile } from "@/components/ui";
import { computePublishedStats } from "@/lib/analytics/stats";
import { prisma } from "@/lib/db/client";
import { getEnv } from "@/lib/env";
import { formatDateTime, RUN_STATUS_LABELS } from "@/lib/format";
import { recoverStaleRuns } from "@/lib/ingestion/run";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await recoverStaleRuns();
  const [stats, latestRun, degradedSources, pendingCount, draftCount, failedAiCount, latestPublished, sourceCount] =
    await Promise.all([
      computePublishedStats(),
      prisma.ingestionRun.findFirst({ orderBy: { createdAt: "desc" } }),
      prisma.source.findMany({ where: { status: "degraded" } }),
      prisma.article.count({ where: { status: { in: ["normalized", "analyzed"] }, learningEntry: { is: null } } }),
      prisma.learningEntry.count({ where: { status: "draft" } }),
      prisma.article.count({ where: { status: "analyze_failed" } }),
      prisma.learningEntry.findMany({
        where: { status: "published" },
        orderBy: { publishedAt: "desc" },
        take: 5,
        include: {
          article: { include: { source: { select: { name: true } } } },
          topics: { include: { topic: true } },
        },
      }),
      prisma.source.count(),
    ]);
  const modelConfigured = getEnv().modelConfigured;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">总览</h1>
        <div className="flex flex-wrap gap-2">
          <IngestButton />
          <ExportButton />
        </div>
      </div>

      {!modelConfigured ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          当前为 <strong>no_ai 模式</strong>（未配置模型）：采集、手工记录、确认、发布和导出均可用；AI
          摘要与评分不可用。在 .env 中配置 MODEL_BASE_URL / MODEL_NAME 后启用。
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="最近运行"
          value={
            latestRun ? (
              <Badge tone={runStatusTone(latestRun.status)}>
                {RUN_STATUS_LABELS[latestRun.status] ?? latestRun.status}
              </Badge>
            ) : (
              "尚未运行"
            )
          }
          hint={latestRun ? formatDateTime(latestRun.createdAt) : "点击“开始采集”体验"}
        />
        <StatTile label="待处理资讯" value={pendingCount} hint="未忽略且未建草稿" />
        <StatTile label="90 天学习记录" value={stats.records90d} hint="仅统计已发布" />
        <StatTile
          label="异常信源"
          value={degradedSources.length}
          hint={`共 ${sourceCount} 个信源`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="学习热力图（最近 90 天，仅已发布）">
          <Heatmap data={stats.heatmap} days={90} />
        </Card>
        <Card title="本周期关注主题（最近 90 天，仅已发布）">
          {stats.topTopics.length === 0 ? (
            <p className="text-sm text-stone-500">还没有已发布的学习记录。</p>
          ) : (
            <ul className="space-y-1.5">
              {stats.topTopics.map((t) => (
                <li key={t.name} className="flex items-center justify-between text-sm">
                  <span>{t.name}</span>
                  <span className="text-stone-500">{t.count}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-stone-400">
            活跃周（12 周）：{stats.activeWeeks12}｜主题数（90 天）：{stats.topicCount90d}｜实践关联：
            {stats.linkedPracticeCount}
          </p>
        </Card>
      </div>

      <Card title="最近学习（已发布）">
        {latestPublished.length === 0 ? (
          <p className="text-sm text-stone-500">
            还没有已发布记录。从 <Link href="/inbox" className="underline">收件箱</Link>{" "}
            保存草稿、填写学习结论并确认发布后出现在这里。
          </p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {latestPublished.map((entry) => (
              <li key={entry.id} className="py-2.5">
                <Link href={`/learning/${entry.id}`} className="text-sm font-medium hover:underline">
                  {entry.article.title}
                </Link>
                <p className="mt-0.5 line-clamp-2 text-sm text-stone-600">{entry.userTakeaway}</p>
                <p className="mt-0.5 text-xs text-stone-400">
                  {entry.article.source.name}｜{formatDateTime(entry.publishedAt)}｜
                  {entry.topics.map((t) => t.topic.name).join("、")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="需要处理">
        <ul className="space-y-1.5 text-sm">
          <li>
            <Link href="/inbox" className="hover:underline">
              待处理资讯：{pendingCount} 条
            </Link>
          </li>
          <li>
            <Link href="/learning?status=draft" className="hover:underline">
              待补充学习草稿：{draftCount} 条
            </Link>
          </li>
          <li>
            <Link href="/inbox?aiStatus=analyze_failed" className="hover:underline">
              AI 分析失败：{failedAiCount} 条
            </Link>
          </li>
          {degradedSources.map((s) => (
            <li key={s.id} className="text-red-700">
              <Link href="/sources" className="hover:underline">
                信源异常：{s.name}（{s.lastErrorCode ?? "未知错误"}）
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
