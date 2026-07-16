import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, handleApiError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/client";
import { normalizeSourceUrl } from "@/lib/dedup/canonicalUrl";
import { SOURCE_TYPES } from "@/types/domain";

const sourceBodySchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(SOURCE_TYPES),
  url: z.string().min(1).max(2000),
  publicName: z.string().max(120).optional().nullable(),
  exportAllowed: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

function validateUrl(url: string, type: string) {
  if (type === "GITHUB_RELEASE" && /^[\w.-]+\/[\w.-]+$/.test(url.trim())) return;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ApiError("validation_error", "URL 无效", 400, { field: "url" });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ApiError("validation_error", "URL 必须为 http 或 https", 400, { field: "url" });
  }
}

export async function GET() {
  try {
    const sources = await prisma.source.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { articles: true } } },
    });
    return NextResponse.json({ sources });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = sourceBodySchema.parse(await req.json());
    validateUrl(body.url, body.type);

    const feedInput = body.type === "GITHUB_RELEASE" && !body.url.startsWith("http")
      ? `https://github.com/${body.url.trim()}`
      : body.url;
    const normalizedUrl = normalizeSourceUrl(feedInput, body.type);

    const duplicate = await prisma.source.findUnique({ where: { normalizedUrl } });
    if (duplicate) {
      throw new ApiError("duplicate", "相同类型和 URL 的信源已存在", 409);
    }

    const source = await prisma.source.create({
      data: {
        name: body.name,
        type: body.type,
        url: body.url,
        normalizedUrl,
        publicName: body.publicName || null,
        exportAllowed: body.exportAllowed ?? false,
        enabled: body.enabled ?? true,
        status: body.enabled === false ? "disabled" : "active",
      },
    });
    return NextResponse.json({ source }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
