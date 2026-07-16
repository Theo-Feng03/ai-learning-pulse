import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api/errors";
import { getEntry, updateEntry } from "@/lib/learning/service";

const patchSchema = z.object({
  userTakeaway: z.string().max(5000).optional(),
  whyFollow: z.string().max(2000).nullable().optional(),
  impact: z.string().max(2000).nullable().optional(),
  topicIds: z.array(z.string()).max(10).optional(),
  projectLinks: z
    .array(
      z.object({
        projectName: z.string().min(1).max(120),
        projectUrl: z.url().max(2000),
        note: z.string().max(500).nullable().optional(),
        isPublic: z.boolean(),
      }),
    )
    .max(10)
    .optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    return NextResponse.json({ entry: await getEntry(id) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = patchSchema.parse(await req.json());
    const { entry, revertedToDraft } = await updateEntry(id, body);
    return NextResponse.json({ entry, revertedToDraft });
  } catch (err) {
    return handleApiError(err);
  }
}
