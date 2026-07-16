// CLI 采集入口：pnpm ingest
// 供 cron / launchd 调用。退出码 0 = completed 或 partial_failed；非 0 = 整体失败。
import { prisma } from "../src/lib/db/client";
import { createRun, recoverStaleRuns, runIngestion } from "../src/lib/ingestion/run";

async function main() {
  await recoverStaleRuns();
  const run = await createRun("cli");
  console.log(`[ingest] run ${run.id} 开始`);
  const finished = await runIngestion(run.id);
  console.log(
    `[ingest] 状态=${finished.status} 信源 ${finished.sourceSuccess}/${finished.sourceTotal} ` +
      `拉取=${finished.fetchedCount} 新增=${finished.newCount} 去重=${finished.dedupCount} ` +
      `AI 成功=${finished.aiSuccess} 失败=${finished.aiFailed} 跳过=${finished.aiSkipped} ` +
      `耗时=${finished.durationMs ?? 0}ms`,
  );
  if (finished.status === "completed" || finished.status === "partial_failed") {
    process.exitCode = 0;
  } else {
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error("[ingest] 失败：", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
