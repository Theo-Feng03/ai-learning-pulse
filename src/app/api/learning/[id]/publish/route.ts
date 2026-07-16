import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/errors";
import { exportShowcase } from "@/lib/export/showcase";
import { publishEntry } from "@/lib/learning/service";
import { getSettings } from "@/lib/settings";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const entry = await publishEntry(id);

    // 默认不自动覆盖导出；设置中开启 autoExportOnPublish 后自动重新导出
    const settings = await getSettings();
    let autoExported = false;
    if (settings.autoExportOnPublish) {
      try {
        await exportShowcase();
        autoExported = true;
      } catch (err) {
        console.error("[publish] 自动导出失败：", err instanceof Error ? err.message : err);
      }
    }

    return NextResponse.json({
      status: entry.status,
      publishedAt: entry.publishedAt,
      autoExported,
      exportSuggested: !settings.autoExportOnPublish,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
