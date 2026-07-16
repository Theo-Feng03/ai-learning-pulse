import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { handleApiError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/client";

const PAGE_SIZE = 30;

// 收件箱查询：时间窗、来源、AI 状态、学习状态、最低分数筛选 + 服务端分页
export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams;
    const page = Math.max(1, Number(q.get("page")) || 1);
    const windowHours = Number(q.get("windowHours")) || 0;
    const sourceId = q.get("sourceId") || undefined;
    const aiStatus = q.get("aiStatus") || undefined;
    const learningState = q.get("learningState") || undefined; // unprocessed | ignored | drafted
    const minScore = Number(q.get("minScore")) || 0;
    const topic = q.get("topic") || undefined;

    const where: Prisma.ArticleWhereInput = {};
    if (windowHours > 0) {
      where.publishedAt = { gte: new Date(Date.now() - windowHours * 3600_000) };
    }
    if (sourceId) where.sourceId = sourceId;
    if (aiStatus) where.aiStatus = aiStatus;
    if (learningState === "ignored") where.status = "ignored";
    else if (learningState === "drafted") where.learningEntry = { isNot: null };
    else if (learningState === "unprocessed") {
      where.status = { notIn: ["ignored"] };
      where.learningEntry = { is: null };
    }
    if (minScore > 0) where.analysis = { relevanceScore: { gte: minScore } };
    if (topic) {
      where.analysis = {
        ...(where.analysis as Prisma.AIAnalysisWhereInput | undefined),
        topics: { contains: `"${topic}"` },
      };
    }

    const [total, items] = await Promise.all([
      prisma.article.count({ where }),
      prisma.article.findMany({
        where,
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          source: { select: { id: true, name: true } },
          analysis: true,
          learningEntry: { select: { id: true, status: true } },
          storyGroup: { include: { _count: { select: { articles: true } } } },
        },
      }),
    ]);

    return NextResponse.json({
      items,
      pagination: { page, pageSize: PAGE_SIZE, total, pages: Math.ceil(total / PAGE_SIZE) },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
