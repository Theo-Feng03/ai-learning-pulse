import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/client";

export async function GET() {
  try {
    const topics = await prisma.topic.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json({ topics });
  } catch (err) {
    return handleApiError(err);
  }
}
