import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { translateArticle } from "@/lib/ai/translateArticle";
import { handleApiError } from "@/lib/api/errors";

const bodySchema = z.object({
  targetLang: z.enum(["zh", "en"]).optional(),
});

// 翻译文章标题与摘要；结果缓存，重复调用不重复消耗模型
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = bodySchema.parse(await req.json().catch(() => ({})));
    const result = await translateArticle(id, body.targetLang);
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
