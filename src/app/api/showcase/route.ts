import { readFile, stat } from "node:fs/promises";
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errors";
import { showcaseSchema } from "@/lib/export/schema";
import { showcaseFilePath } from "@/lib/export/showcase";

// 公开预览数据：只读取已生成的 showcase.json（与个人主页消费同一份产物）
export async function GET() {
  try {
    const filePath = showcaseFilePath();
    const [raw, fileStat] = await Promise.all([readFile(filePath, "utf8"), stat(filePath)]);
    const payload = showcaseSchema.parse(JSON.parse(raw));
    return NextResponse.json({ payload, fileMtime: fileStat.mtime.toISOString() });
  } catch {
    return errorResponse(
      "not_found",
      "showcase.json 不存在或不可读。请先执行导出（pnpm export:showcase 或在页面上点击导出）。",
      404,
    );
  }
}
