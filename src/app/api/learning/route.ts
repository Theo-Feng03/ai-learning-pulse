import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { computePublishedStats } from "@/lib/analytics/stats";
import { handleApiError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/client";

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams;
    const status = q.get("status") || undefined;
    const topicSlug = q.get("topic") || undefined;

    const where: Prisma.LearningEntryWhereInput = {};
    if (status) where.status = status;
    if (topicSlug) where.topics = { some: { topic: { slug: topicSlug } } };

    const [items, stats] = await Promise.all([
      prisma.learningEntry.findMany({
        where,
        orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
        take: 200,
        include: {
          article: { include: { source: { select: { name: true } } } },
          topics: { include: { topic: true } },
          projectLinks: true,
        },
      }),
      computePublishedStats(),
    ]);

    return NextResponse.json({ items, stats });
  } catch (err) {
    return handleApiError(err);
  }
}
