import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, handleApiError } from "@/lib/api/errors";
import { startVideoJob } from "@/lib/video/service";

const linkSchema = z.object({
  url: z.url().max(2000),
  title: z.string().max(300).optional(),
  sourceName: z.string().max(120).optional(),
});

const UPLOAD_DIR = path.resolve(process.cwd(), "data/video-uploads");
const MAX_UPLOAD = 800 * 1024 * 1024;

// 视频 → 学习草稿：JSON = 链接模式；multipart = 文件模式（抖音等直连失败时的保底通道）
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      const originalUrl = String(form.get("originalUrl") ?? "").trim();
      const title = String(form.get("title") ?? "").trim();
      const sourceName = String(form.get("sourceName") ?? "").trim();

      if (!(file instanceof File) || file.size === 0) {
        throw new ApiError("validation_error", "缺少视频/音频文件", 400);
      }
      if (file.size > MAX_UPLOAD) {
        throw new ApiError("validation_error", "文件超过 800MB 上限", 400);
      }
      try {
        const u = new URL(originalUrl);
        if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
      } catch {
        throw new ApiError("validation_error", "请填写原视频链接（保证来源可追溯）", 400);
      }

      mkdirSync(UPLOAD_DIR, { recursive: true });
      const ext = path.extname(file.name) || ".mp4";
      const filePath = path.join(UPLOAD_DIR, `upload-${Date.now()}${ext}`);
      await writeFile(filePath, Buffer.from(await file.arrayBuffer()));

      const job = await startVideoJob({
        filePath,
        originalUrl,
        title: title || undefined,
        sourceName: sourceName || undefined,
      });
      return NextResponse.json({ jobId: job.id }, { status: 202 });
    }

    const body = linkSchema.parse(await req.json());
    const job = await startVideoJob({
      url: body.url,
      title: body.title,
      sourceName: body.sourceName,
    });
    return NextResponse.json({ jobId: job.id }, { status: 202 });
  } catch (err) {
    return handleApiError(err);
  }
}
