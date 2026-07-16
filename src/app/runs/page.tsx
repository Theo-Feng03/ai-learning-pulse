import Link from "next/link";
import { Badge, Card, runStatusTone } from "@/components/ui";
import { prisma } from "@/lib/db/client";
import { formatDateTime, RUN_STATUS_LABELS } from "@/lib/format";
import { recoverStaleRuns } from "@/lib/ingestion/run";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  await recoverStaleRuns();
  const runs = await prisma.ingestionRun.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { _count: { select: { errors: true } } },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">运行记录</h1>
      <Card>
        {runs.length === 0 ? (
          <p className="text-sm text-stone-500">还没有采集运行。到总览页点击“开始采集”。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
                  <th className="py-2 pr-3">时间</th>
                  <th className="py-2 pr-3">状态</th>
                  <th className="py-2 pr-3">触发</th>
                  <th className="py-2 pr-3">信源</th>
                  <th className="py-2 pr-3">拉取/新增/去重</th>
                  <th className="py-2 pr-3">AI 成功/失败/跳过</th>
                  <th className="py-2 pr-3">耗时</th>
                  <th className="py-2">错误</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-b border-stone-100">
                    <td className="py-2 pr-3">
                      <Link href={`/runs/${run.id}`} className="hover:underline">
                        {formatDateTime(run.createdAt)}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">
                      <Badge tone={runStatusTone(run.status)}>
                        {RUN_STATUS_LABELS[run.status] ?? run.status}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3">{run.trigger === "cli" ? "CLI" : "手动"}</td>
                    <td className="py-2 pr-3">
                      {run.sourceSuccess}/{run.sourceTotal}
                      {run.sourceFailed > 0 ? (
                        <span className="text-red-600">（失败 {run.sourceFailed}）</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3">
                      {run.fetchedCount}/{run.newCount}/{run.dedupCount}
                    </td>
                    <td className="py-2 pr-3">
                      {run.aiSuccess}/{run.aiFailed}/{run.aiSkipped}
                    </td>
                    <td className="py-2 pr-3">{run.durationMs != null ? `${run.durationMs}ms` : "—"}</td>
                    <td className="py-2">
                      {run._count.errors > 0 ? (
                        <Link href={`/runs/${run.id}`} className="text-red-600 hover:underline">
                          {run._count.errors} 条
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
