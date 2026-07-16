import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleApiError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/client";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const job = await prisma.videoJob.findUnique({ where: { id } });
    if (!job) throw new ApiError("not_found", "任务不存在", 404);
    return NextResponse.json({ job });
  } catch (err) {
    return handleApiError(err);
  }
}
