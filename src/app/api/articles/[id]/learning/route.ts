import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/errors";
import { createDraftForArticle } from "@/lib/learning/service";

// 从文章创建学习草稿；重复调用返回已有草稿（幂等）
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { entry, created } = await createDraftForArticle(id);
    return NextResponse.json(
      { learningEntryId: entry.id, created },
      { status: created ? 201 : 200 },
    );
  } catch (err) {
    return handleApiError(err);
  }
}
