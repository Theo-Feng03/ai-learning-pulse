import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleApiError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/client";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const article = await prisma.article.findUnique({
      where: { id },
      include: {
        source: true,
        analysis: true,
        learningEntry: { select: { id: true, status: true } },
        storyGroup: {
          include: {
            articles: {
              select: { id: true, title: true, source: { select: { name: true } } },
            },
          },
        },
      },
    });
    if (!article) throw new ApiError("not_found", "文章不存在", 404);
    return NextResponse.json({ article, analysis: article.analysis, storyGroup: article.storyGroup });
  } catch (err) {
    return handleApiError(err);
  }
}
