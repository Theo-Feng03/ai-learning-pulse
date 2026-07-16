import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, runStatusTone } from "@/components/ui";
import { prisma } from "@/lib/db/client";
import { formatDateTime, RUN_STATUS_LABELS } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await prisma.ingestionRun.findUnique({
    where: { id },
    include: { errors: { include: { source: { select: { id: true, name: true } } } } },
  });
  if (!run) notFound();

  const counters: Array<[string, string | number]> = [
    ["信源总数", run.sourceTotal],
    ["信源成功", run.sourceSuccess],
    ["信源失败", run.sourceFailed],
    ["拉取条目", run.fetchedCount],
    ["新增文章", run.newCount],
    ["去重跳过", run.dedupCount],
    ["AI 成功", run.aiSuccess],
    ["AI 失败", run.aiFailed],
    ["AI 跳过", run.aiSkipped],
    ["总耗时", run.durationMs != null ? `${run.durationMs}ms` : "—"],
  ];

  return (
    <div className="max-w-3xl space-y-4">
      <Link href="/runs" className="text-sm text-stone-500 hover:underline">
        ← 返回运行记录
      </Link>

      <Card
        title={
          <span className="flex items-center gap-2">
            运行详情
            <Badge tone={runStatusTone(run.status)}>{RUN_STATUS_LABELS[run.status] ?? run.status}</Badge>
          </span>
        }
      >
        <p className="text-xs text-stone-400">
          {run.id}｜{run.trigger === "cli" ? "CLI" : "手动"}｜开始 {formatDateTime(run.startedAt)}｜完成{" "}
          {formatDateTime(run.completedAt)}
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-5">
          {counters.map(([label, value]) => (
            <div key={label} className="rounded bg-stone-50 p-2">
              <dt className="text-xs text-stone-500">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card title={`错误详情（${run.errors.length}）`}>
        {run.errors.length === 0 ? (
          <p className="text-sm text-stone-500">本次运行没有记录错误。</p>
        ) : (
          <ul className="space-y-2">
            {run.errors.map((err) => (
              <li key={err.id} className="rounded border border-red-100 bg-red-50 p-2.5 text-sm">
                <p>
                  <Badge tone="red">{err.stage}</Badge>{" "}
                  <span className="font-mono text-xs">{err.code}</span>
                  {err.retryable ? <span className="ml-1 text-xs text-stone-500">（可重试）</span> : null}
                </p>
                <p className="mt-1 text-stone-700">{err.message}</p>
                <p className="mt-0.5 text-xs text-stone-400">
                  {err.source ? `信源：${err.source.name}` : ""}
                  {err.articleId ? (
                    <>
                      ｜<Link href={`/articles/${err.articleId}`} className="underline">查看文章</Link>
                    </>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
