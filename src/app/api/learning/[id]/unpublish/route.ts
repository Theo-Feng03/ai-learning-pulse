import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/errors";
import { unpublishEntry } from "@/lib/learning/service";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const entry = await unpublishEntry(id);
    return NextResponse.json({ status: entry.status });
  } catch (err) {
    return handleApiError(err);
  }
}
