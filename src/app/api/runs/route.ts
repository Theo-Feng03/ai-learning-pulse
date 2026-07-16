import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/client";
import { recoverStaleRuns } from "@/lib/ingestion/run";

export async function GET() {
  try {
    await recoverStaleRuns();
    const runs = await prisma.ingestionRun.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { _count: { select: { errors: true } } },
    });
    return NextResponse.json({ runs });
  } catch (err) {
    return handleApiError(err);
  }
}
