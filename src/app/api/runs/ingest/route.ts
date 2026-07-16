import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/errors";
import { createRun, recoverStaleRuns, runIngestion } from "@/lib/ingestion/run";

// 创建采集任务并在后台执行；前端轮询 GET /api/runs/[id] 查看进度
export async function POST() {
  try {
    await recoverStaleRuns();
    const run = await createRun("manual");
    // 故意不 await：任务在请求返回后继续执行
    void runIngestion(run.id).catch((err) => {
      console.error("[ingest] 后台执行失败：", err instanceof Error ? err.message : err);
    });
    return NextResponse.json({ runId: run.id, status: run.status }, { status: 202 });
  } catch (err) {
    return handleApiError(err);
  }
}
