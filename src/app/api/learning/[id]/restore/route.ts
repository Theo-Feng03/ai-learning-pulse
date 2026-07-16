import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/errors";
import { restoreEntry } from "@/lib/learning/service";

// 恢复归档：archived → confirmed（校验不通过时回到 draft）
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const entry = await restoreEntry(id);
    return NextResponse.json({ status: entry.status });
  } catch (err) {
    return handleApiError(err);
  }
}
