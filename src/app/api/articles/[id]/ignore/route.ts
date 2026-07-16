import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleApiError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/client";

// 忽略 / 取消忽略
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const article = await prisma.article.findUnique({
      where: { id },
      include: { learningEntry: { select: { id: true } } },
    });
    if (!article) throw new ApiError("not_found", "文章不存在", 404);
    if (article.learningEntry) {
      throw new ApiError("invalid_state", "已有学习草稿的文章不能忽略", 409);
    }
    const nextStatus = article.status === "ignored" ? "normalized" : "ignored";
    const updated = await prisma.article.update({
      where: { id },
      data: { status: nextStatus },
    });
    return NextResponse.json({ status: updated.status });
  } catch (err) {
    return handleApiError(err);
  }
}
