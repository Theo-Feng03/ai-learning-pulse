import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleApiError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/client";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const run = await prisma.ingestionRun.findUnique({
      where: { id },
      include: { errors: { include: { source: { select: { id: true, name: true } } } } },
    });
    if (!run) throw new ApiError("not_found", "运行记录不存在", 404);
    return NextResponse.json({ run, errors: run.errors });
  } catch (err) {
    return handleApiError(err);
  }
}
