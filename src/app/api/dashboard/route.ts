import { NextResponse } from "next/server";
import { computePublishedStats } from "@/lib/analytics/stats";
import { handleApiError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/client";
import { getEnv } from "@/lib/env";

export async function GET() {
  try {
    const [stats, latestRun, degradedSources, pendingCount, draftCount, latestPublished] =
      await Promise.all([
        computePublishedStats(),
        prisma.ingestionRun.findFirst({ orderBy: { createdAt: "desc" } }),
        prisma.source.findMany({ where: { status: "degraded" } }),
        prisma.article.count({ where: { status: { in: ["normalized", "analyzed"] } } }),
        prisma.learningEntry.count({ where: { status: "draft" } }),
        prisma.learningEntry.findMany({
          where: { status: "published" },
          orderBy: { publishedAt: "desc" },
          take: 5,
          include: { article: { include: { source: true } }, topics: { include: { topic: true } } },
        }),
      ]);

    return NextResponse.json({
      stats,
      latestRun,
      degradedSources,
      pendingCount,
      draftCount,
      latestPublished,
      modelConfigured: getEnv().modelConfigured,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
