import { readFile } from "node:fs/promises";
import Link from "next/link";
import { Heatmap } from "@/components/Heatmap";
import { Badge, Card, StatTile } from "@/components/ui";
import { showcaseSchema, type ShowcasePayload } from "@/lib/export/schema";
import { showcaseFilePath } from "@/lib/export/showcase";
import { formatDate, formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

async function loadShowcase(): Promise<ShowcasePayload | null> {
  try {
    const raw = await readFile(showcaseFilePath(), "utf8");
    return showcaseSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export default async function ShowcasePage() {
  const payload = await loadShowcase();
  // “导出过期”提示：当前已发布数量与导出文件不一致
  const publishedCount = await prisma.learningEntry.count({ where: { status: "published" } });
  const stale = payload !== null && payload.entries.length !== publishedCount;

  if (!payload) {
    return (
      <div className="max-w-3xl space-y-4">
        <h1 className="text-xl font-bold">公开预览</h1>
        <Card>
          <p className="text-sm text-stone-600">
            还没有生成 showcase.json。发布至少一条学习记录后，在总览页点击“导出展示数据”，或执行{" "}
            <code className="rounded bg-stone-100 px-1">pnpm export:showcase</code>。
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">公开预览</h1>
        <p className="text-xs text-stone-400">本页完全由 exports/showcase.json 渲染（与个人主页一致）</p>
      </div>

      {stale ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          导出数据可能已过期（当前已发布 {publishedCount} 条，导出文件包含 {payload.entries.length}{" "}
          条）。请重新导出。
        </p>
      ) : null}

      <Card>
        <h2 className="text-lg font-bold">{payload.profile.productName}</h2>
        <p className="mt-1 text-sm text-stone-600">{payload.profile.description}</p>
        <p className="mt-1 text-xs text-stone-400">
          最近更新：{formatDateTime(payload.generatedAt)}
          {payload.profile.githubUrl ? (
            <>
              ｜
              <a href={payload.profile.githubUrl} target="_blank" rel="noreferrer" className="underline">
                GitHub
              </a>
            </>
          ) : null}
        </p>
        <p className="mt-2 rounded bg-stone-50 px-2 py-1 text-xs text-stone-500">
          本页面只统计本人确认发布的学习记录；自动抓取的资讯数量不计入学习成果。
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="90 天学习记录" value={payload.stats.records90d} />
        <StatTile label="12 周活跃周" value={payload.stats.activeWeeks12} />
        <StatTile label="关注主题数" value={payload.stats.topicCount90d} />
        <StatTile label="学习到实践" value={payload.stats.linkedPracticeCount} />
      </div>

      <Card title="最近 90 天学习热力图">
        <Heatmap data={payload.heatmap} days={90} />
      </Card>

      {payload.topics.length > 0 ? (
        <Card title="当前关注主题（最近 90 天）">
          <div className="flex flex-wrap gap-1.5">
            {payload.topics.map((t) => (
              <Badge key={t.name} tone="blue">
                {t.name} × {t.count}
              </Badge>
            ))}
          </div>
        </Card>
      ) : null}

      <Card title={`最近学习记录（${payload.entries.length}）`}>
        {payload.entries.length === 0 ? (
          <p className="text-sm text-stone-500">还没有已发布的学习记录。</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {payload.entries.map((entry) => (
              <li key={entry.id} className="py-3">
                <p className="font-medium">
                  <a href={entry.sourceUrl} target="_blank" rel="noreferrer" className="hover:underline">
                    {entry.title} ↗
                  </a>
                </p>
                <p className="mt-0.5 text-xs text-stone-400">
                  {entry.sourceName}
                  {entry.sourcePublishedAt ? `｜原文 ${formatDate(entry.sourcePublishedAt)}` : ""}｜学习于{" "}
                  {formatDate(entry.publishedAt)}
                </p>
                {entry.summaryZh ? (
                  <p className="mt-1.5 text-sm text-stone-500">
                    <span className="text-xs text-sky-700">【AI 摘要】</span>
                    {entry.summaryZh}
                  </p>
                ) : null}
                <p className="mt-1.5 text-sm text-stone-800">
                  <span className="text-xs text-emerald-700">【我的学习结论】</span>
                  {entry.userTakeaway}
                </p>
                {entry.whyFollow ? (
                  <p className="mt-1 text-sm text-stone-600">
                    <span className="text-xs text-stone-400">为什么关注：</span>
                    {entry.whyFollow}
                  </p>
                ) : null}
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {entry.topics.map((t) => (
                    <Badge key={t}>{t}</Badge>
                  ))}
                  {entry.projectLinks.map((link) => (
                    <a key={link.projectUrl} href={link.projectUrl} target="_blank" rel="noreferrer">
                      <Badge tone="purple">实践：{link.projectName} ↗</Badge>
                    </a>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-xs text-stone-400">
        数据来源：公开可信 AI 信源；完整工具见本仓库。
        <Link href="/" className="ml-1 underline">
          返回本地工作区
        </Link>
      </p>
    </div>
  );
}
