import { NextResponse } from "next/server";
import { errorResponse, handleApiError } from "@/lib/api/errors";
import { exportShowcase, SHOWCASE_FILENAME } from "@/lib/export/showcase";

export async function POST() {
  try {
    const result = await exportShowcase();
    // 返回相对路径，避免本地绝对路径出现在响应中
    return NextResponse.json({
      path: `exports/${SHOWCASE_FILENAME}`,
      count: result.count,
      checksum: result.checksum,
    });
  } catch (err) {
    if (err instanceof Error) {
      return errorResponse("export_failed", "导出失败，上一个成功版本已保留", 500, {
        reason: err.message.slice(0, 300),
      });
    }
    return handleApiError(err);
  }
}
