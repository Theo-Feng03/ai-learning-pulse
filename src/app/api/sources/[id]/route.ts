import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, handleApiError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/client";
import { normalizeSourceUrl } from "@/lib/dedup/canonicalUrl";

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  url: z.string().min(1).max(2000).optional(),
  publicName: z.string().max(120).nullable().optional(),
  exportAllowed: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = patchSchema.parse(await req.json());
    const source = await prisma.source.findUnique({ where: { id } });
    if (!source) throw new ApiError("not_found", "信源不存在", 404);

    let normalizedUrl = source.normalizedUrl;
    if (body.url && body.url !== source.url) {
      const feedInput =
        source.type === "GITHUB_RELEASE" && !body.url.startsWith("http")
          ? `https://github.com/${body.url.trim()}`
          : body.url;
      normalizedUrl = normalizeSourceUrl(feedInput, source.type);
      const duplicate = await prisma.source.findUnique({ where: { normalizedUrl } });
      if (duplicate && duplicate.id !== id) {
        throw new ApiError("duplicate", "相同类型和 URL 的信源已存在", 409);
      }
    }

    const updated = await prisma.source.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.url !== undefined ? { url: body.url, normalizedUrl } : {}),
        ...(body.publicName !== undefined ? { publicName: body.publicName || null } : {}),
        ...(body.exportAllowed !== undefined ? { exportAllowed: body.exportAllowed } : {}),
        ...(body.enabled !== undefined
          ? { enabled: body.enabled, status: body.enabled ? "active" : "disabled" }
          : {}),
      },
    });
    return NextResponse.json({ source: updated });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const source = await prisma.source.findUnique({ where: { id } });
    if (!source) throw new ApiError("not_found", "信源不存在", 404);
    await prisma.source.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return handleApiError(err);
  }
}
