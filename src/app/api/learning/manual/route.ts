import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api/errors";
import { createManualEntry } from "@/lib/learning/manual";

const bodySchema = z.object({
  title: z.string().min(1).max(500),
  url: z.string().min(1).max(2000),
  sourceName: z.string().max(120).optional(),
  excerpt: z.string().max(2000).optional(),
});

// 手动创建学习记录：任意 URL（短视频、公众号、书、课程…）
export async function POST(req: NextRequest) {
  try {
    const body = bodySchema.parse(await req.json());
    const { entry, created, reusedArticle } = await createManualEntry(body);
    return NextResponse.json(
      { learningEntryId: entry.id, created, reusedArticle },
      { status: created ? 201 : 200 },
    );
  } catch (err) {
    return handleApiError(err);
  }
}
